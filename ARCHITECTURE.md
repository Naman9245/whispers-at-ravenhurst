# Architecture — Whispers at Ravenhurst

> **Last updated:** 2026-08-20 · reflects the codebase through **Phase 2.8**
> (host-chosen room settings, the zoom-and-follow camera, the case briefing, the
> stage layout and the suspect rail).

A technical deep-dive: the server-authoritative model, the privacy boundary that
makes it cheat-proof, the shared geometry/rules layer, the baked canvas renderer
and its camera, and the case-generation pipeline. Every function and path
referenced below exists in the codebase as written.

---

## 1. System Overview

```
┌──────────────────────────┐        WebSocket (Socket.io)         ┌──────────────────────────┐
│        CLIENT A           │  ── intents ──▶                       │         SERVER            │
│  React + Canvas (Holmes)  │   region:enter / hotspot:examine /    │  Node + Express +         │
│  renders ONLY its own     │   suspect:ask / suspect:confront /    │  Socket.io                │
│  detective + its own view │   case:ready / accuse:lock            │                           │
└──────────────────────────┘  ◀── filtered view ──                  │  RoomStore → GameRoom     │
                                game:start / state:update /          │  (authoritative state)    │
┌──────────────────────────┐    chat / peer:status / game:reveal     │  buildView() filters      │
│        CLIENT B           │  ◀──────────────────────────────────▶ │  per-player before send   │
│  React + Canvas (Watson)  │                                        └─────────────┬─────────────┘
└──────────────────────────┘                          imports ▼                   ▼ imports + AI
                                        ┌────────────────────────────────┐   ┌──────────────────┐
                                        │  /shared (source of truth)      │   │  Claude API       │
                                        │  mapData · roomObjects ·        │   │  claude-opus-4-8  │
                                        │  roomHotspots · constants ·     │   │  (deferred —      │
                                        │  suspectQuestions · caseSchema  │   │   Phase 3)        │
                                        └────────────────────────────────┘   └──────────────────┘
```

**Clients send *intents*, never state.** A client asks to enter a room, to examine
a hotspot, or to lock in an accusation; the server validates, mutates the
authoritative state, and pushes back a per-player **view**. The client never tells
the server something the server trusts blindly — and it never learns anything the
rules say it shouldn't.

---

## 2. Server Architecture

### 2.1 Bootstrap (`server/index.js`)
Express serves a `/health` endpoint; Socket.io handles everything else. On each
connection, every handler module registers its listeners on the socket:

```js
io.on("connection", (socket) => {
  registerLobby(io, socket, store);
  registerMovement(io, socket, store);
  registerInvestigate(io, socket, store);
  registerSuspects(io, socket, store);
  registerAccusation(io, socket, store);
  socket.on("disconnect", () => handleDisconnect(io, socket, store));
});
```

### 2.2 Room registry + lifecycle (`server/rooms.js`)
`RoomStore` keeps a `Map<code, GameRoom>` in memory. Codes are 5 chars from an
unambiguous alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no `0/O`, `1/I`).
`registerLobby` handles `room:create` (creator → **Holmes**, and the host's
`settings` ride along) and `room:join` (joiner → **Watson**); the second join
auto-starts:

```js
if (room.isFull()) {
  await room.start();
  scheduleForceResolve(io, room);   // soft-timer cap on the whole game
  for (const p of room.players) io.to(p.id).emit("game:start", room.viewFor(p.id));
}
```

Two lifecycle rules matter as much as the create/join path:

- **`detachFromRoom(io, socket, store, { left })`** is the single exit path. It
  drops the player, `socket.leave()`s the code, clears `socket.data`, emits
  `peer:status { connected: false, left }`, refreshes the remaining views and
  calls `reapIfEmpty`. Both `room:leave` (Exit Game / Play Again / Main Menu) and
  `room:create` / `room:join` call it, so **one socket can never hold two rooms**.
- **`reapIfEmpty(room)`** clears the room's timers and deletes it from the Map
  once nobody is left. Before it existed, every finished or abandoned game stayed
  resident for the lifetime of the process.

`handleDisconnect` flags the player `connected = false`, notifies the opponent via
`peer:status`, and schedules removal + reap after `RECONNECT_WINDOW_MS` (30s).
Token-based rejoin is still Phase 4 work — `player.token` exists and is handed to
the client, but nothing consumes it yet.

### 2.3 The state machine per room (`server/game.js`)
`GameRoom` owns player records, the case data (incl. the solution), clue/question/
accusation state, and the timers. Status moves **`lobby` → `playing` → `ended`**.

| Subsystem | Methods |
|-----------|---------|
| Lifecycle | `addPlayer`, `removePlayer`, `isFull`, `start`, `markReady` |
| Movement | `setRegion` |
| Investigation | `tryExamine`, `cluePoolFor`, `progressCount`, `foundCluesFor` |
| Questioning | `tryAsk`, `tryConfront`, `questioningStateFor` |
| Accusation | `accuseOpensAt`, `tryLock`, `startFinalWindow`, `scoreFor`, `resolve` |
| Timers | `clearTimers` (owned by the room; cleared on resolve and on reap) |
| Serialization | `viewFor` (delegates to `buildView`) |

### 2.4 Host-chosen room settings and the clock (Phase 2.8)

Settings are chosen by whoever creates the room (Among Us style) and arrive as
**untrusted wire data**, so they only ever enter the room through
`sanitizeSettings` (`shared/constants.js`), which is **whitelist-only** — a value
that isn't exactly one of the listed options is discarded and the fallback's value
kept, never clamped toward the sent value:

```js
export const SETTING_OPTIONS = {
  softTimer:      [null, 900, 1200, 1800, 2700],  // Off · 15 · 20 · 30 · 45 min
  accuseGate:     [0, 180, 300],                  // 0 · 3 · 5 min
  opponentWindow: [120, 180, 300],                // 2 · 3 · 5 min
  hotspotMarkers: [true, false],
  sprint:         [true, false],
  rivalProgress:  [true, false],
};
```

Precedence inside the `GameRoom` constructor, highest first:

```js
this.settings = (() => {
  const fast = process.env.WHISPERS_FAST_TIMERS;
  if (fast === "demo") return { ...DEFAULT_SETTINGS, softTimer: 900, accuseGate: 0, opponentWindow: 120 };
  if (fast) return { ...DEFAULT_SETTINGS, softTimer: 8, accuseGate: 0, opponentWindow: 2 };
  const base = devMode ? DEV_SETTINGS : DEFAULT_SETTINGS;
  return settings ? sanitizeSettings(settings, base) : base;
})();
```

`WHISPERS_FAST_TIMERS` wins over everything because the whole socket test suite
depends on that precedence; **Dev Mode is now just the `DEV_SETTINGS` preset**
(60s / 20s / 30s). `this.timers` is derived from `this.settings`, so the wire shape
`buildView` has always shipped is unchanged.

> ⚠️ **`softTimer: null` (Timer: Off) is load-bearing in two places that silently
> invert the feature if unguarded**, because `null * 1000 === 0`:
> `scheduleForceResolve()` would compute a delay of 0 and reveal the solution on the
> next tick, and `buildView().accusation.softMs` would freeze the client clock at
> 0:00. Both are guarded with `== null`. Timer: Off still **ends** — the first
> lock-in arms the rival window. `server/test/timerOff.js` is the regression.

**The briefing does not burn the clock.** `startedAt` is set when the second player
joins, but play only *begins* once both detectives send **`case:ready`**:

```js
markReady(id) {
  if (this.status !== "playing" || this.playStarted) return false;
  const p = this.player(id);
  if (!p) return false;
  p.ready = true;
  if (!this.players.every((x) => x.ready)) return false;
  this.playStarted = true;
  this.startedAt = Date.now();      // the clock starts HERE, not at join
  this.finalDeadline = null;
  return true;
}
```

The handler re-arms the soft cap against the new origin. The design is **additive
on purpose**: a socket that never acks behaves exactly as before, which is why
every raw-socket server test still passes untouched. A *client* that skips the
briefing must ack immediately (App does this on `game:start` for `?menu=skip`) or
its partner waits on an ack that never comes. `server/test/briefingClock.js` pins
it.

### 2.5 Per-client view filtering (`server/views.js`)
`buildView()` is the **only** function that turns server state into something sent
to a client (see §6). The opponent is reduced to a five-field summary — no
position, no clue contents, no notebook — and the clue count itself is withheld
when the host chose *Rival progress: Hidden*:

```js
clueCount: room.settings.rivalProgress ? room.progressCount(opp) : null,
```

`publicCase()` ships the cast list, victim flavour, weapon list and room labels.
Since 2.8 it deliberately includes the **suspect dossier** (`age, height, build,
occupation, handedness, note`) and the **weapon `type` + `description`**, because
the clues describe what the *killer* was and the player crosses names off by
reading the cards. It still omits the solution, every clue's text and
`eliminates`, and the red herrings.

### 2.6 The handlers (`server/handlers/`)
Each handler is thin: validate via a `GameRoom` method, ack the caller privately,
emit a **vague** ambient line to both players, then push fresh views.

- **`movement.js`** — `region:enter`. The client free-roams in pixel space and
  reports the room it entered (or that it stepped into the corridor). Positions are
  never broadcast; only a "moved to another room…" note is. Entry is deliberately
  *not* gated on the connection graph — the corridor physically joins all six
  rooms, so walls + doorways (shared collision geometry) are the real constraint.
- **`investigate.js`** — `hotspot:examine`. Examines one furniture **hotspot** in
  the player's current room via `tryExamine`; returns the clue placed there for
  THIS player (if any) or nothing, stripped of the `eliminates` key. The
  hotspot→clue map never leaves the server until that exact spot is examined.
- **`suspects.js`** — `suspect:ask` (budget-capped, one branch at a time) and
  `suspect:confront` (an evidence branch that may carry a behavioral tell).
- **`accusation.js`** — `case:ready`, `accuse:lock`, plus `resolveGame` and
  `scheduleForceResolve`. The first lock-in cancels the soft cap and opens the
  opponent's final window:

```js
if (room.lockedCount() === 1) {
  clearTimeout(room._softTimer);
  room._softTimer = null;
  room.startFinalWindow();
  room._windowTimer = setTimeout(() => resolveGame(io, room),
                                 room.timers.opponentWindow * 1000);
}
```

### 2.7 AI case generation pipeline (`server/ai/generateCase.js`)
`room.start()` calls `generateCase()`, which loads `fallbackCase.json`, runs it
through `validateCase()`, and returns it. The live `claude-opus-4-8` call (with
retry ×3, falling back to the baked case on any failure or validation miss) is the
Phase 3 slot-in at the marked point. The key is read from
`process.env.ANTHROPIC_API_KEY` **server-side only** and is never sent to a client.

---

## 3. Client Architecture

### 3.1 App shell (`client/src/App.jsx`)
`App` holds the pre-game phase, wires the Socket.io listeners once, and derives all
accusation timing on a 1-second heartbeat. Rendering is driven entirely by the
`view` the server pushes (`applyView` also records the server-clock offset for
countdown sync).

Screen order, and where each one comes from:

| Screen | Condition |
|--------|-----------|
| **Main menu** | `phase === "menu"` (client state; `?menu=skip` starts at the lobby) |
| **Lobby** | `phase === "lobby"`, or any time there is no `view` |
| **Case briefing** | `view.status === "playing" && !briefed` (client state, acked with `case:ready`) |
| **Game stage** | `view.status === "playing" && briefed` |
| **Reveal** | a `game:reveal` payload arrived *while still in the game* |

Note that "playing" has always been **derived from the server view** rather than
stored as a phase, which is why the briefing is a branch inside the render rather
than a fourth `phase` value.

Three guards in here are load-bearing:

- **`inGameRef`** — a `game:reveal` that arrives when we are no longer in a game is
  ignored. An abandoned room can still resolve on its own soft cap, and the
  listener is mounted for the app's whole lifetime, so without this a stale reveal
  would yank the player out of the menu, the lobby, or the next game.
- **The delegated capture-phase click listener** plays the UI click for *every*
  `<button>`. Capture is required: modal wrappers call `e.stopPropagation()` for
  the backdrop guard, which — because React's stopPropagation also stops the native
  event — hides in-modal buttons from a bubble-phase listener. Buttons owning
  another sound opt out with `data-sound="off"`.
- **`audioUnlocked`** flips only after `unlockAudio()`'s priming settles, so the
  menu rain that no-op'd before the first gesture actually starts afterwards.

Timing derivations (recomputed each heartbeat) all treat `softMs == null` as *no
deadline*, never as *deadline of zero*:

```js
const noLimit  = acc?.softMs == null && !acc?.finalDeadline;
const gameEndAt = acc?.startedAt
  ? acc.finalDeadline || (acc.softMs == null ? 0 : acc.startedAt + acc.softMs)
  : 0;
const urgent = view?.status === "playing" && Boolean(acc?.startedAt) && !noLimit
  && actMsLeft > 0 && actMsLeft <= 60_000;
```

### 3.2 Component tree
```
App
├── .pre-game                      (ONE wrapper across menu + lobby)
│   ├── MenuBackdrop               (the idle-mansion scene — mounted ONCE, never remounted)
│   ├── MainMenu                   (typewriter title · Desk · Case Files · Begin)
│   └── Lobby                      (create / join / Dev Mode / the settings panel)
├── CaseBriefing                   (black screen, story typed out → "Enter the Manor")
│   └── CaseBriefingBody           (shared with the Scenario tab — cannot drift)
├── hud-bar                        (the race scoreboard)
│   ├── PlayerHud                  (you: identity · room · LOCKED IN ✓ · pips)
│   ├── TimerBar                   (phase + countdown; red in the final minute)
│   ├── RivalHud                   (them: pips · name · Investigating / LOCKED IN)
│   └── hud-tools                  (📜 Activity · 📓 Notebook · 🗺 Map · ☰ Menu)
├── .stage
│   ├── board-hero
│   │   ├── BoardCanvas            (the hero — see §3.3)
│   │   ├── ActionBar              (MOVE · QUESTION · ACCUSE pills, floating inside the board)
│   │   └── toast / vignette-edges
│   ├── TabStrip                   (Scenario · Questions · Log, collapsed by default)
│   └── suspect-rail → SuspectCard (flip cards: theory on the front, dossier on the back)
├── ActivityLog                    (slide-in from left; hard size-capped)
├── DeductionNotebook              (slide-in sidebar from right — Weapons · Rooms)
├── MapOverlay                     (M / Esc — the manor map with a live "you are here")
├── GameMenu                       (sound toggle · room code · exit)
├── SuspectModal / AccusationModal / ExamineModal   (centered overlays)
└── RevealScreen                   (solution + both accusations + scores)
```

`MenuBackdrop` sits at the **same tree position** across the menu ⇄ lobby swap, so
React never remounts it and the scene never resets; it unmounts only when a game
starts or the reveal shows.

### 3.3 Canvas renderer (`client/src/game/`)
The board is drawn on a single `<canvas>` whose backing store is fixed at
`BOARD_W × BOARD_H` (1472 × 860) and CSS-scaled to fit. There is no game engine.

**The static half is baked once** (`boardLayers.js`). Backdrop, corridor, brick,
floors, furniture, doors, lighting, vignette and labels paint into an offscreen
canvas and are blitted thereafter; only firelight flicker and the player-specific
room highlights are per-frame. The bake is a module-level singleton shared by
gameplay and the menu scene, and `window.__wrBoard.bakes` **must stay at 1** — the
game loop must never invalidate it. Since 2.8 the bake is stored at
**`BAKE_SCALE = 2`** (2944 × 1720, ~20 MB) because the camera zooms *in*, and
magnifying a 1:1 bitmap turns mortar lines and room labels to mush. The bake
context is pre-scaled, so `paintStatic` and its ~600 lines of helpers keep drawing
in world units, unchanged.

> ⚠️ Callers that read *out* of the bitmap (`drawOccluders`, `drawOverhead`) take a
> **SOURCE** rect in bake pixels and write a **DEST** rect in world units. Only the
> source takes the scale. Getting it wrong doesn't throw — it blits the wrong
> corner of the mansion over the detective.

**The camera** (`camera.js`) is a per-frame *transform*, never a re-bake. It keeps
`x/y` as the world point at the centre of the view, follows the detective with
dt-framed exponential smoothing (`FOLLOW_RATE = 7`), snaps instead of easing past
`SNAP_DIST = 400` (the e2e suites teleport the character by writing
`window.__wrChar.x/y`), and clamps so the view never leaves the board.
`DEFAULT_ZOOM = 1.75` frames about two rooms across; `[` and `]` nudge it live in
DEV builds only.

**`BoardCanvas.jsx`** owns the single `requestAnimationFrame` loop. Each frame is
three explicit bands:

1. **Screen space — clear.** An explicit fill: under a camera the board blit is no
   longer guaranteed to cover the canvas, so it can't serve as an implicit clear.
2. **World space — the scene.** `cam.applyTo(ctx)`, then `drawBoard`, the
   character, `drawOccluders` (tall furniture the detective is standing *behind*),
   `drawOverhead` (wall/ceiling pieces, unconditional), and `drawExamineGlow` (a
   diegetic ring on the hotspot being searched).
3. **Screen space — UI.** Transform reset, then hotspot markers and the search
   bubble, projected through `cam.toView` so they keep a constant on-screen size at
   any zoom. Markers are drawn **after** the occluders — drawn before, walking
   behind the sideboard made its own magnifier vanish.

The same loop reads the WASD/arrow state, applies sprint (gated on the host's
`sprint` setting), publishes the feet position to `playerPos`, drives the footstep
sound off the movement state, tracks the nearest **unexamined** hotspot within
`EXAMINE_RADIUS`, and edge-triggers **E**. Clicking is proximity-gated the same
way, and inverts the camera (`cam.toWorld`) — the only canvas-to-board mapping in
the client.

**`Character.js`** owns the detective's pixel position (its **feet**), facing,
animation, and anchor room. Movement integrates the input vector at `MOVE_SPEED`
(×2 while sprinting) and resolves collisions by trying the full move, then sliding
along whichever axis stays walkable:

```js
if (isWalkable(nx, ny, open))          { this.x = nx; this.y = ny; }
else if (isWalkable(nx, this.y, open)) { this.x = nx; }
else if (isWalkable(this.x, ny, open)) { this.y = ny; }
```

After collision it checks whether the feet actually advanced (≥0.5px) and falls
back to `idle` if not, so walking into a wall doesn't moonwalk. `_openRooms()`
returns **all six rooms** — the corridor physically connects them, and gating on
graph-neighbours stranded players at doorways they could plainly see.

**`drawBoard.js`** is pure drawing: `paintStatic` (the bake painter), `drawBoard`
(blit + flicker + highlights), `drawHotspots`, `drawOccluders`, `drawOverhead`,
`drawExamineGlow`, `drawBubble`, `searchBubbleScale` and `drawMiniMap`. The
minimap is **one scaled `drawImage` of the bake**, not a second renderer, so it
cannot drift from the real board — and it marks only the requesting player's own
position. **`sprites.js`** loads character frames from `public/assets/sprites.json`
(caching the *promise*, not the value, so concurrent callers share one fetch).
**`objectSprites.js`** is the optional-PNG slot for furniture art — every `sprite`
path is unset today, so the mansion is fully procedural, and it must stay that way
until the files exist (a 404 fails four e2e suites that assert zero console
errors). **`menuScene.js`** is the idle-mansion engine behind the menu and lobby:
two translucent ghost detectives, camera drift, room-light pulses, lightning — ONE
rAF, zero timers, kill-switch `MENU_GHOSTS_ENABLED`.

### 3.4 State that deliberately lives outside React
Two module stores exist because the data changes **per frame**, and routing it
through `setState` would re-render the whole game tree sixty times a second:

- **`playerPos.js`** — written once per frame by `BoardCanvas`, read by
  `MapOverlay`'s own rAF while the map is open. This is why the map's dot is right
  in the corridor and between rooms. It is deliberately **not** `window.__wrChar`:
  that handle is stripped from production builds, so a map reading it would work in
  dev and break for real players.
- **`bubbles.js`** — timestamp-scheduled speech bubbles with **zero timers**
  (nothing to cancel means nothing leaks under StrictMode double-mount).
  *Status: the module and `drawBubble` both ship, and the searching cloud uses the
  bubble, but no gameplay event calls `say()` yet — see §10.*

### 3.5 Audio (`client/src/game/sound.js`)
One HTML5-`<audio>` manager is the **only** place sounds are defined or played: 13
preloaded CC0 clips behind named `play…()` exports, per-sound volumes, a global
mute (`setMuted`, persisted as `wr.soundOn`) and `unlockAudio()` to satisfy
autoplay policy on the first gesture. One-shots play a short-lived **clone** per
shot, because a single `<audio>` element can't retrigger mid-play; loops carry a
`loopIntent` set plus an `ended` → restart self-heal so the rain bed can't die
mid-session.

Wiring: footsteps are transition-driven in `BoardCanvas`; everything else lives in
`App` — the searching loop, clue/nothing dings, the one-shot tick burst at the 1:00
mark, the rain bed's lifecycle (start on pre-game or gameplay, stop at the reveal,
resume on unmute), the 30–90s creak scheduler (**`inGame` only**), the notebook
swish, the accusation-lock-in sting and the reveal sting. A dev-only
`window.__wrAudio` handle (with a `fire.*` map) lets e2e trigger one-shots
deterministically.

### 3.6 Networking (`client/src/net/socket.js`)
A thin promise wrapper over Socket.io; every intent is an `emit` whose ack resolves
a promise. Crucially, `ask()` **always settles** — a 7s timeout resolves with the
same `{ ok: false, error }` shape every caller already handles, so a dead backend
surfaces as an error instead of a button stuck on "Creating…" forever.

```js
export const net = {
  socket,
  createRoom: (name, devMode, settings) => ask("room:create", { name, devMode, settings }),
  joinRoom:   (code, name)     => ask("room:join", { code, name }),
  leaveRoom:  ()               => ask("room:leave", {}),
  enterRegion:(room, inCorridor) => ask("region:enter", { room, inCorridor }),
  examine:    (hotspotId)      => ask("hotspot:examine", { hotspotId }),
  askSuspect: (suspectId, questionId) => ask("suspect:ask", { suspectId, questionId }),
  confrontSuspect:(suspectId, clueId) => ask("suspect:confront", { suspectId, clueId }),
  accuse:     (payload)        => ask("accuse:lock", payload),
  caseReady:  ()               => ask("case:ready", {}),   // both acks start the clock
  requestState:()              => ask("state:request", {}),
  on, off,
};
```

---

## 4. Shared Layer (`/shared`)

Imported by **both** sides via the `@shared` alias (Vite) / relative path (server).
The client's `game/boardData.js` is a one-line re-export of `mapData.js`, so game
code keeps its local import path while the truth stays shared.

### 4.1 `mapData.js` — geometry and the connection graph
Six rooms in a 3×2 grid joined by one corridor. `CONNECTIONS` defines edges;
`ADJACENCY` is the O(1) lookup. It also defines the **collision geometry**:
`roomInterior(id)` / `CORRIDOR_INTERIOR` (walkable rects inset by
`WALL_INSET = 16`), `doorwayRect(id)` (gap half-width `DOOR_HALF = 44`, matched to
the drawn door), and the core test:

```js
export function isWalkable(x, y, openRoomIds) {
  if (inRect(x, y, CORRIDOR_INTERIOR)) return true;
  for (const id of openRoomIds) {
    if (inRect(x, y, doorwayRect(id))) return true;          // doorways always clear
    if (inRect(x, y, roomInterior(id))) {
      const r = roomRect(id);
      return !inSolidObject(x - r.x, y - r.y, id);            // furniture carves holes
    }
  }
  return false;
}
```

`roomStanding(id)` returns the spawn point — the room centre, or the nearest
walkable point spiralling outward if furniture has taken it. `pathBetween(a, b)`
gives door → corridor → door waypoints (used by the menu ghosts).

### 4.2 `roomObjects.js` — the single source of truth for furniture
Each object is `{ id, name?, kind, x, y, w, h, solid, searchable, tall?, overhead?,
sprite? }` in room-relative px (against 384 × 252), and it drives **all three**
consumers: collision (`isWalkable` subtracts `solid` rects), hotspots
(`roomHotspots.js` derives them from `searchable`), and rendering (`drawBoard`'s
`drawFromObjects`). **The rect that is drawn IS the rect that blocks.** Today:
47 objects, 31 solid, 24 searchable, 11 tall, 11 overhead.

`tall` and `overhead` are separate on purpose: `tall` pieces occlude only when the
detective is standing further back than the piece's front face (`drawOccluders`),
while `overhead` pieces — wall- and ceiling-mounted — re-blit unconditionally
(`drawOverhead`). Pieces hanging on a wall or ceiling (paintings, knife rack,
chandelier, glazing) are `solid: false`: they're above or behind the floor plane,
so they're examinable but never an obstacle.

> **ROOM LAYOUT RULE** (a first pass got this wrong and trapped the player inside a
> desk): keep the room **centre** (192, 126) clear — that is the spawn point — and
> keep the **door column** (x 148..236) clear from the centre out to the door edge:
> the BOTTOM wall for row-0 rooms (study/dining/lounge), the TOP wall for row-1
> (library/kitchen/conservatory). `server/test/movement.js` [5] reachability ·
> [6] doorway · [7] spawn · [8] flood-fill connectivity · [9] centre-walkable
> enforce all of it. **[8] matters most**: furniture can carve an isolated island of
> floor that passes both [5] and [6] while stranding a clue.

> ⚠️ The 24 searchable **ids and their rooms are load-bearing** —
> `fallbackCase.json` places clues by hotspot id and `validateCase()` cross-checks
> id → room. Positions may change freely; ids and rooms may not.

### 4.3 `roomHotspots.js` — derived, not hand-written
`ROOM_HOTSPOTS` (4 per room, 24 total) and `HOTSPOT_BY_ID` are **generated** from
the `searchable` entries in `roomObjects.js` and normalized to 0..1 inside the room
box. The exported shape is unchanged from when it was a hand-maintained table — but
a marker can no longer point at furniture that isn't there (the Study once
advertised a fireplace hotspot over a drawn floor lamp). Holds **no clue mapping**,
so it stays safe to ship to a client.

### 4.4 `constants.js` — the tunables both sides must agree on
```js
export const MOVE_SPEED = 160;            // px/sec at internal resolution
export const EXAMINE_RADIUS = 26;         // feet → NEAREST POINT of the object's rect
export const SEARCH_MS = 2500;            // searching animation before the result
export const QUESTION_CAP = 4;            // CORE questions per (player, suspect)
export const TIMER_PRESETS = {
  production: { softTimer: 1200, accuseGate: 300, opponentWindow: 180 }, // 20m / 5m / 3m
  dev:        { softTimer: 60,   accuseGate: 20,  opponentWindow: 30  }, // short, for testing
};
export const CLUE_DISTRIBUTION = { shared: 3, privatePerPlayer: 4, redHerringPerPlayer: 1 };
export const PROGRESS_TOTAL = 7;          // 3 shared + 4 private (identical for both)
```
Plus `SETTING_OPTIONS` / `DEFAULT_SETTINGS` / `DEV_SETTINGS` / `sanitizeSettings`
(§2.4). `EXAMINE_RADIUS` is measured to the **nearest point** of the object's rect,
not its centre — measuring to the centre would put the middle of a desk ~28px from
its own edge, so a solid desk could never be examined at all.

### 4.5 `suspectQuestions.js` — the interrogation catalogue
`CORE_QUESTIONS` (12, every suspect answers) plus `SUSPECT_QUESTIONS` (15 each,
written to that character) = **102** questions. `validateCase()` requires each
suspect to answer only **its own** set; the old cross-product rule would have
demanded ~600 answers for a pool this size. Question **text** is shared because the
client renders it; **answers** live in the case JSON and arrive one branch at a
time. `requiresClue` questions are filtered client-side *and* re-checked in
`tryAsk` — the client's list is advisory and must never be trustable.

### 4.6 `caseSchema.js` — the solvability proof
`validateCase(caseData)` — see §8.

---

## 5. Critical Design Patterns

- **Server-authoritative state.** Clients send intents; the server validates and is
  the sole authority. The render loop is purely visual; the **game clock** is the
  server's `setTimeout`s.
- **Per-client view filtering.** One serializer (`buildView`) — if a field isn't
  added there, it can't reach a client.
- **Enforcement lives at the boundary, never in CSS.** *Rival progress: Hidden* is
  a `null` from `views.js`. Shipping the number and styling it away would be a
  two-click devtools cheat.
- **Untrusted input has exactly one door.** `room:create` had no validation at all,
  so host settings must pass through `sanitizeSettings` — whitelist-only, never
  clamped toward the sent value.
- **Case-JSON validation with retry/fallback.** Every case is proven solvable before
  play; a bad case fails loudly in dev and falls back to the baked one.
- **Dialogue-tree branch resolution.** `tryAsk` / `tryConfront` return exactly one
  branch; the full tree never leaves the server.
- **Suspects can lie, and lies must be breakable.** An answer may be
  `{ base, afterConfront, brokenBy }` (a plain string is still valid). Once the
  player confronts the suspect with `brokenBy`, that question becomes re-askable
  exactly **once, for free** (tracked with a `"!"`-suffixed marker) — otherwise
  anyone who asked *before* finding the evidence could never hear the story
  collapse. The culprit's **core** answers must be breakable, and at least two
  innocents must have breakable stories too, or "who is lying" is the whole puzzle.
  `server/test/interrogation.js` [6b] pins the loop.
- **Investigating buys interrogation leverage.** `QUESTION_CAP` (4) applies to
  **core questions only**; clue-unlocked ones are free.
- **Action lockout after lock-in — but you can still WALK.** Once `p.accusation` is
  set, `tryExamine` / `tryAsk` / `tryConfront` short-circuit and the client disables
  every action pill. **`setRegion` is deliberately NOT gated**: a locked-in
  detective may pace the manor while their rival finishes, which leaks nothing —
  room/inCorridor are private and the movement chat line is vague on purpose.
  `server/test/lockout.js` asserts both halves.
- **Leaving a room is a server intent, not a client state reset.** Exit Game / Play
  Again / Main Menu all send `room:leave`; the server drops the player, tells the
  opponent, and reaps the room once empty.
- **Forfeiting is never a win.** `resolve()` picks winners only among players who
  actually submitted an accusation, so a double forfeit yields `winners: []` and the
  reveal reads "No one cracked the case."
- **Client-side searching state (no protocol change).** Examining a hotspot enters a
  2.5s *searching* state in `App`: `BoardCanvas` draws the cloud bubble + the amber
  ring and input is locked. After `SEARCH_MS` the client fires `net.examine` and
  opens the result modal — so the opponent only sees the ambient note once the
  examine **commits**, never that an animation is running. `prefers-reduced-motion`
  skips it, and a 5s safety timeout resets a wedged search.
- **Sprint is a client-side speed multiplier.** Holding **Shift** doubles the
  per-frame step. No protocol change: `setRegion` only records *which room* a client
  entered and never trusts pixel positions, and the collision geometry is shared, so
  faster local movement can't reach anywhere a walking player couldn't.
- **Modals** close with **Esc** (and their buttons). **Enter** also closes the
  Examine and Suspect modals, but is deliberately inert on the **Accusation** modal
  — locking in is irreversible, so a stray Return must never submit. Every modal
  blurs its trigger button on mount, or the still-focused pill re-activates on Enter
  and the modal instantly re-opens.
- **Everything the player must reason with is printed on the page.** Suspects carry
  an attribute row (height · build · handedness) on the card front *and* in the
  dossier; weapons carry a **type** (BLADE / BLUNT / POISON / LIGATURE / FIREARM).
  Clues state what the **killer** was; the **cards** say who that rules out.

---

## 6. Security / Anti-Cheat

`buildView()` (`server/views.js`) is the single most important file for fairness:

```js
opponent: opp ? {
  name: opp.name,
  character: opp.character,
  clueCount: room.settings.rivalProgress ? room.progressCount(opp) : null,
  lockedIn: opp.lockedIn,
  connected: opp.connected,
} : null,
```

- **The solution never reaches a client** until `game:reveal`. `publicCase()` ships
  only the cast list + dossier, victim flavour, weapon list, and room labels —
  never the solution, clue text/`eliminates`, or red herrings.
- **All moves are server-validated.** `region:enter` is re-checked server-side; the
  collision geometry is enforced client-side every frame from the *shared* module,
  so it cannot drift from the server's notion of a room.
- **All clue pickups are server-validated.** `tryExamine` reveals the clue at an
  examined hotspot only when its room matches the player's current room and the spot
  hasn't been examined; the `eliminates` key is stripped. **The hotspot→clue mapping
  is never serialized** — a player learns what's at a hotspot only by standing there
  and examining it.
- **Found clues are stripped of `red_herring` too**, so a herring is
  indistinguishable from a real clue in the notebook. The player has to reason it
  out.
- **Dialogue trees are never sent in full** — only the active branch.
- **Clue-gated questions are re-checked in `tryAsk`.** The client filters its own
  list, but that list is advisory; a crafted socket message must not bypass it.
- **Question budget is enforced server-side** — `QUESTION_CAP` per suspect per
  player, tracked in `questionsUsed`.
- **Host settings are whitelisted server-side** (`sanitizeSettings`), so a crafted
  `room:create` can't send `accuseGate: -1` or `softTimer: 1e12`.
- **Post-accusation actions are rejected server-side** (see §5).
- The boundary is **test-covered**: `server/test/lobbyFlow.js` asserts the strings
  `"solution"`, `"eliminates"`, `"red_herring"`, `"culprit"`, `"dialogue_tree"`, and
  sample prose never appear in any view payload; `lockout.js` asserts post-lock-in
  rejection; `settings.js` and `timerOff.js` pin the settings path.

---

## 7. Game Loop / State Machine

```
        room:create / room:join
LOBBY ───────────────────────────▶ PLAYING ───────────────────────────▶ ENDED ──▶ game:reveal
  │     (2nd player → room.start())   │                                   │
  │                                   │  case:ready ×2 → the CLOCK starts │
  │                                   │  examine · question · accuse      │
  │                            accuseGate opens ACCUSE            resolve() triggered by:
  │                                   │                            • both locked in
  │                            first lock-in →                     • opponent window closes
  │                            startFinalWindow()                  • soft timer expires
  │                                                                  (never, if Timer: Off)
  └─ disconnect → peer:status, 30s cleanup · room:leave → detach + reap
```

A session: two clients connect → create/join → on the second join the server
generates+validates the case, sets `status = "playing"`, and `scheduleForceResolve`
arms the soft cap. Both clients open on the **case briefing**; each acks with
`case:ready`, and the second ack moves the timer origin to *now* and re-arms the
cap. Players investigate/question freely. After `accuseGate`, `ACCUSE` unlocks; the
first `accuse:lock` cancels the soft cap and opens the opponent's final window.
**`resolve()` is computed exactly once** — guarded on `status === "ended"`, it
returns `null` on later calls, so the soft timer, the window timer, and a second
lock-in can all *try* to resolve but only the first wins. The reveal (solution +
both accusations + scores) is pushed to both players in one `game:reveal`.

### Scoring (`GameRoom.scoreFor` / `resolve`)
| Component | Rule |
|-----------|------|
| **Base** | +1 each for a correct culprit, weapon, and room (max 3) |
| **Reasoning** | +1 per cited clue that genuinely supports the solution, capped at +3 |
| **Speed** | among **fully-correct** accusations, earliest +2, the rest +1 |

A clue "supports the solution" only if it eliminates real candidates and never
contradicts the truth — so citing your own red herring earns nothing. An
accusation must cite **2–3 distinct clues the player has actually found**.

### Socket event reference
| Direction | Event | Payload (in → ack/out) |
|-----------|-------|------------------------|
| c → s | `room:create` | `{ name, devMode, settings }` → `{ ok, code, token, view }` |
| c → s | `room:join` | `{ code, name }` → `{ ok, code, token, view }` |
| c → s | `room:leave` | `{}` → `{ ok }` |
| c → s | `case:ready` | `{}` → `{ ok, began }` |
| c → s | `region:enter` | `{ room, inCorridor }` → `{ ok, room, inCorridor, changedRoom }` |
| c → s | `hotspot:examine` | `{ hotspotId }` → `{ ok, found, hotspotId, hotspotName, room, clue? }` |
| c → s | `suspect:ask` | `{ suspectId, questionId }` → `{ ok, answer, broke, free, asked, cap }` |
| c → s | `suspect:confront` | `{ suspectId, clueId }` → `{ ok, response, hadTell }` |
| c → s | `accuse:lock` | `{ culpritId, weaponId, roomId, clueIds }` → `{ ok }` |
| c → s | `state:request` | `{}` → `{ ok, view }` |
| s → c | `game:start` / `state:update` | the player's filtered `view` |
| s → c | `chat` | `{ who, character, text, kind }` (vague/ambient only) |
| s → c | `peer:status` | `{ connected, left? }` |
| s → c | `game:reveal` | `{ solution, monologue, players[], winners }` |

---

## 8. AI Case Generation

```
room.start()
   └─▶ generateCase({ devMode })            // server/ai/generateCase.js
          ├─ loadFallbackCase()             // reads ai/fallbackCase.json
          ├─ validateCase(case)             // shared/caseSchema.js — solvability proof
          └─ returns the case (solution included — SERVER ONLY)
```

**Expected schema** (`shared/caseSchema.js` header): `{ case_id, map, narrative,
solution:{ culprit_id, weapon_id, room_id }, suspects:[6], weapons:[6],
clues:{ shared:[3], player1_private:[4], player2_private:[4], red_herrings_p1:[1],
red_herrings_p2:[1] }, dialogue_trees, validation }`. Clues carry machine-checkable
eliminations `clue.eliminates = { suspects:[ids], weapons:[ids], rooms:[ids] }` and
a `clue.hotspot` placing them on a specific furniture spot in `clue.found_in`.
Suspects carry an optional dossier (`age, height, build, occupation, handedness,
note`); weapons carry `type` + `description`; `narrative` carries `victim_name`,
`opening`, `victim_backstory` and `ending_monologue_template` (filled with
`{culprit}` / `{weapon}` / `{room}` at reveal time).

**Validation rules** (`validateCase`):
- **Structure/counts** — exactly 6 suspects, 6 weapons, and the 3/4/4/1/1 clue
  split; the solution references real ids.
- **Solvability** — using only shared + their own private clues, *each* detective's
  surviving candidates collapse to exactly one suspect / weapon / room, matching the
  solution.
- **Integrity** — real clues never eliminate the true culprit/weapon/room; red
  herrings *must* contradict the solution (so a herring is exposed once the real
  clues are in).
- **Hotspots** — every clue's `hotspot` is a real hotspot in its own room, and no
  two of a player's clues share a hotspot (one clue per hotspot per player).
- **Dialogue** — every suspect answers **its own** question set (core + its own 15);
  an answer is either a plain string or `{ base, afterConfront, brokenBy }` with
  `brokenBy` naming a real clue; every `requiresClue` names a real clue; and each
  suspect has at least one `evidence_response` carrying a behavioral `tell`.

> The dossier fields are allowed to discriminate, and the clues lean on them — but
> **`clue.eliminates` stays the ONLY machine-checkable truth**. The validator proves
> solvability from it alone, so any dossier detail a clue leans on MUST also appear
> in that clue's `eliminates`, or solvability stops meaning what `validateCase()`
> claims.

**Retry logic (Phase 3):** the live call will attempt generation up to **3 times**,
running each result through `validateCase`, and fall back to the baked,
pre-validated `fallbackCase.json` on any failure. Today the game always serves the
baked case, so it's playable with no key — and the validator runs on every load.

---

## 9. Test Map

Run all ten with `cd server && npm test`. `test/run-all.js` starts a fresh server in
each timer mode the table below lists, refuses to start if :3001 is already taken,
and is the same command GitHub Actions runs (`.github/workflows/test.yml`).

| File | Needs a server? | Covers |
|------|-----------------|--------|
| `server/test/caseValidation.js` | no | the validator against the baked case + deliberately broken variants |
| `server/test/accusation.js` | no | gate, scoring, forfeit — clock driven by setting `startedAt` |
| `server/test/movement.js` | no | pure geometry: reachability, doorways, spawn, flood-fill connectivity, centre-walkable |
| `server/test/settings.js` | no | `sanitizeSettings` whitelist + Dev Mode / `WHISPERS_FAST_TIMERS` precedence |
| `server/test/briefingClock.js` | yes (`=1`) | `case:ready` moves the timer origin; a non-acking socket behaves as before |
| `server/test/lobbyFlow.js` | yes (`=1`) | create/join, auto-start, movement, **the privacy boundary** |
| `server/test/lockout.js` | yes (`=demo`) | post-lock-in: actions rejected, **movement still allowed** |
| `server/test/hotspots.js` | yes (`=demo`) | hotspot examination end-to-end over sockets |
| `server/test/interrogation.js` | yes (`=1`) | per-suspect sets, clue unlocks, lies + re-ask, budget |
| `server/test/timerOff.js` | yes (**no** fast timers) | Timer: Off never force-resolves and never ships `softMs: 0` |

Browser e2e lives in `.shots/*.mjs` (puppeteer, two real tabs, run from the repo
root). Dev-only handles the suites drive: `window.__wrChar` (position),
`window.__wrCam`, `window.__wrHotspot()`, `window.__wrBoard.bakes`,
`window.__wrAudio.state()` / `.fire.*`, `window.__wrMenu.state()`,
`window.__wrBubble`. All suites load `?menu=skip`, which also skips the briefing
(`&briefing=1` opts back in).

> **Two traps worth knowing.** (1) Always restart the server after touching
> `server/` or the case JSON — Node doesn't hot-reload, and a stale process has
> twice faked a bug. `npm run dev` frees ports 3001/5173 first and logs each kill.
> (2) Hotspot *centres* are inside solid furniture and unreachable by definition —
> reach is measured to the nearest point of the rect, so e2e must walk to a standing
> spot **beside** the piece.

---

## 10. Built but Not Yet Wired

An honest inventory, so nobody goes looking for a caller that doesn't exist:

- **Contextual speech bubbles** — `game/bubbles.js` and `drawBubble`'s text mode
  both ship, and the searching cloud uses the bubble, but **no gameplay event calls
  `say()`** yet. The dev handle `window.__wrBubble` is its only consumer.
- **Procedural idle** (breathing bob / idle glance) is **not** in `Character.js`;
  idle animation is still the sprite sheet's own idle frames.
- **`drawSearching`** in `drawBoard.js` is superseded by `drawBubble` +
  `drawExamineGlow` (which `BoardCanvas` composes itself, so the bubble can live in
  screen space and the ring in world space) and currently has no callers.
- **`player.token`** is generated and returned but nothing consumes it — token-based
  reconnect is Phase 4.
- **`objectSprites.js`** is a working loader with zero `sprite:` paths declared; the
  mansion is fully procedural on purpose.
- **Live case generation** — the pipeline, validator and fallback are complete; the
  `claude-opus-4-8` call is the marked slot-in point in `generateCase()`.
