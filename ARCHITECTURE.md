# Architecture — Whispers at Ravenhurst

> **Last updated:** 2026-06-21

A technical deep-dive: the server-authoritative model, the privacy boundary that
makes it cheat-proof, the shared geometry/rules layer, the canvas render loop, and
the case-generation pipeline. Every function and path referenced below exists in
the codebase as written.

---

## 1. System Overview

```
┌──────────────────────────┐        WebSocket (Socket.io)         ┌──────────────────────────┐
│        CLIENT A           │  ── intents ──▶                       │         SERVER            │
│  React + Canvas (Holmes)  │   region:enter / investigate /        │  Node + Express +         │
│  renders ONLY its own     │   suspect:ask / accuse:lock           │  Socket.io                │
│  detective + its own view │  ◀── filtered view ──                 │                           │
└──────────────────────────┘   game:start / state:update /         │  RoomStore → GameRoom     │
                                chat / game:reveal                   │  (authoritative state)    │
┌──────────────────────────┐                                        │  buildView() filters      │
│        CLIENT B           │  ◀──────────────────────────────────▶ │  per-player before send   │
│  React + Canvas (Watson)  │                                        └─────────────┬─────────────┘
└──────────────────────────┘                          imports ▼                   ▼ imports + AI
                                            ┌────────────────────────────┐   ┌──────────────────┐
                                            │  /shared (source of truth) │   │  Claude API       │
                                            │  mapData·constants·schema  │   │  claude-opus-4-8  │
                                            └────────────────────────────┘   │  (Phase 2.1)      │
                                                                             └──────────────────┘
```

**Clients send *intents*, never state.** A client asks to enter a room or lock in an
accusation; the server validates, mutates the authoritative state, and pushes back a
per-player **view**. The client never tells the server where it "is" in a way the
server trusts blindly — and it never learns anything the rules say it shouldn't.

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

### 2.2 In-memory state keyed by room code (`server/rooms.js`)
`RoomStore` keeps a `Map<code, GameRoom>` in memory. Codes are 5 chars from an
unambiguous alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no `0/O`, `1/I`).
`registerLobby` handles `room:create` (creator → **Holmes**) and `room:join`
(joiner → **Watson**); the second join auto-starts:

```js
if (room.isFull()) {
  await room.start();
  scheduleForceResolve(io, room);   // soft-timer cap on the whole game
  for (const p of room.players) io.to(p.id).emit("game:start", room.viewFor(p.id));
}
```

`handleDisconnect` flags the player `connected = false`, notifies the opponent via
`peer:status`, and schedules cleanup after `RECONNECT_WINDOW_MS` (30s).

### 2.3 The state machine per room (`server/game.js`)
`GameRoom` owns player records, the case data (incl. the solution), clue/question/
accusation state, and the timers. Status moves **`lobby` → `playing` → `ended`**.

| Subsystem | Methods |
|-----------|---------|
| Lifecycle | `addPlayer`, `removePlayer`, `isFull`, `start` |
| Movement | `setRegion` |
| Investigation | `tryExamine`, `cluePoolFor`, `progressCount`, `foundCluesFor` |
| Questioning | `tryAsk`, `tryConfront`, `questioningStateFor` |
| Accusation | `accuseOpensAt`, `tryLock`, `startFinalWindow`, `scoreFor`, `resolve` |
| Serialization | `viewFor` (delegates to `buildView`) |

Timers come from `shared/constants.js`, with an env override for automated runs:

```js
this.timers = (() => {
  const fast = process.env.WHISPERS_FAST_TIMERS;
  if (fast === "demo") return { softTimer: 900, accuseGate: 0, opponentWindow: 120 };
  if (fast) return { softTimer: 8, accuseGate: 0, opponentWindow: 2 };
  return devMode ? TIMER_PRESETS.dev : TIMER_PRESETS.production;
})();
```

### 2.4 Per-client view filtering (`server/views.js`)
`buildView()` is the **only** function that turns server state into something sent
to a client (see §6). The opponent is reduced to a four-field summary — no position,
no clue contents, no notebook.

### 2.5 The handlers (`server/handlers/`)
Each handler is thin: validate via a `GameRoom` method, ack the caller privately,
emit a **vague** ambient line to both players, then push fresh views.

- **`movement.js`** — `region:enter`. The client free-roams in pixel space and
  reports the room it entered (or that it stepped into the corridor). Positions are
  never broadcast; only a "moved to another room…" note is.
- **`investigate.js`** — `hotspot:examine`. Examines one furniture **hotspot** in the
  player's current room via `tryExamine`; returns the clue placed there for THIS
  player (if any) or nothing, stripped of the `eliminates` key. The hotspot→clue map
  never leaves the server until that exact spot is examined.
- **`suspects.js`** — `suspect:ask` (one pooled question, budget-capped) and
  `suspect:confront` (an evidence branch that may carry a behavioral tell).
- **`accusation.js`** — `accuse:lock`, plus `resolveGame` and `scheduleForceResolve`.
  The first lock-in cancels the soft cap and opens the opponent's final window:

```js
if (room.lockedCount() === 1) {
  clearTimeout(room._softTimer);
  room.startFinalWindow();
  room._windowTimer = setTimeout(() => resolveGame(io, room),
                                 room.timers.opponentWindow * 1000);
}
```

### 2.6 AI case generation pipeline (`server/ai/generateCase.js`)
`room.start()` calls `generateCase()`, which loads `fallbackCase.json`, runs it
through `validateCase()`, and returns it. The live `claude-opus-4-8` call (with
retry ×3, falling back to the baked case on any failure or validation miss) is the
Phase 2.1 slot-in at the marked point. The key is read from
`process.env.ANTHROPIC_API_KEY` **server-side only** and is never sent to a client.

---

## 3. Client Architecture

### 3.1 App shell (`client/src/App.jsx`)
`App` holds top-level phase (`lobby` → `playing` → reveal), wires the Socket.io
listeners once, and derives all accusation timing on a 1-second heartbeat.
Rendering is driven entirely by the `view` the server pushes (`applyView` also
records the server-clock offset for countdown sync). The minimalist layout keeps the
board uncovered: the activity log and notebook are slide-in panels toggled from the
HUD.

### 3.2 Component tree
```
App
├── Lobby                         (pre-game: create / join / Dev Mode)
├── hud-bar
│   ├── PlayerHud                 (identity · room · LOCKED IN ✓ badge)
│   ├── TimerBar                  (phase + countdown; red in the final minute)
│   ├── ClueTracker               (Holmes/Watson n/7 inline bars)
│   └── hud-tools                 (📜 Activity · 📓 Notebook · ☰ Menu)
├── ActionBar                     (MOVE · INVESTIGATE · QUESTION · ACCUSE pills)
├── BoardCanvas                   (the hero — see §3.3)
├── ActivityLog                   (slide-in from left; hard size-capped)
├── DeductionNotebook             (slide-in sidebar from right)
├── GameMenu                      (sound toggle · how-to-play · exit)
├── SuspectModal / AccusationModal (centered overlays — deliberate focus)
└── RevealScreen                  (solution + both accusations + scores)
```

### 3.3 Canvas renderer (`client/src/game/`)
The board is drawn on a single `<canvas>` at a fixed internal resolution
(`BOARD_W × BOARD_H`) and CSS-scaled to fit. There is no game engine.

- **`BoardCanvas.jsx`** owns a `requestAnimationFrame` loop. Each frame it reads the
  WASD/arrow state into an input vector, advances the `Character`, then draws the
  board and the player's own sprite. The opponent is never drawn. Input is disabled
  while a modal is open or after the player has locked in.
- **`Character.js`** owns the detective's pixel position (its **feet**), facing,
  animation, and anchor room. Movement integrates the input vector at `MOVE_SPEED`
  and resolves collisions by trying the full move, then sliding along whichever axis
  stays walkable:

```js
if (isWalkable(nx, ny, open))          { this.x = nx; this.y = ny; }
else if (isWalkable(nx, this.y, open)) { this.x = nx; }
else if (isWalkable(this.x, ny, open)) { this.y = ny; }
```

- **`drawBoard.js`** is pure drawing (rooms, furniture, doorways, glow). **`sprites.js`**
  loads frames from `public/assets/sprites.json` into an image cache. **`sound.js`**
  is a tiny Web-Audio bank (`unlockAudio`, `playTick`, `setMuted`) — synthesized, so
  it adds no download weight.

### 3.4 Networking (`client/src/net/socket.js`)
A thin promise wrapper over Socket.io; every intent is an `emit` whose ack resolves
a promise:

```js
export const net = {
  createRoom: (name, devMode) => ask("room:create", { name, devMode }),
  joinRoom:   (code, name)    => ask("room:join", { code, name }),
  enterRegion:(room, inCorridor) => ask("region:enter", { room, inCorridor }),
  investigate:()              => ask("investigate", {}),
  askSuspect: (suspectId, questionId) => ask("suspect:ask", { suspectId, questionId }),
  confrontSuspect:(suspectId, clueId) => ask("suspect:confront", { suspectId, clueId }),
  accuse:     (payload)       => ask("accuse:lock", payload),
  requestState:()             => ask("state:request", {}),
  on, off,
};
```

---

## 4. Shared Layer (`/shared`)

Imported by **both** sides via the `@shared` alias (Vite) / relative path (server).

- **`mapData.js`** — six rooms in a 3×2 grid joined by one corridor. `CONNECTIONS`
  defines edges; `ADJACENCY` is the O(1) lookup. It also defines the **collision
  geometry**: `roomInterior(id)` / `CORRIDOR_INTERIOR` (walkable rects inset by
  `WALL_INSET = 16`), `doorwayRect(id)` (gap half-width `DOOR_HALF = 44`, matched to
  the drawn door), and the core test:

```js
export function isWalkable(x, y, openRoomIds) {
  if (inRect(x, y, CORRIDOR_INTERIOR)) return true;
  for (const id of openRoomIds) {
    if (inRect(x, y, roomInterior(id)) || inRect(x, y, doorwayRect(id))) return true;
  }
  return false;
}
```

- **`constants.js`** — the tunables both sides must agree on:

```js
export const MOVE_SPEED = 160;            // px/sec at internal resolution
export const QUESTION_CAP = 3;            // pooled questions per (player, suspect)
export const TIMER_PRESETS = {
  production: { softTimer: 1200, accuseGate: 300, opponentWindow: 180 }, // 20m / 5m / 3m
  dev:        { softTimer: 60,   accuseGate: 20,  opponentWindow: 30  }, // short, for testing
};
export const CLUE_DISTRIBUTION = { shared: 3, privatePerPlayer: 4, redHerringPerPlayer: 1 };
export const PROGRESS_TOTAL = 7;          // 3 shared + 4 private (identical for both)
```

- **`questions.js`** — the flat 10-question `QUESTION_POOL` (each with a stable `id`)
  the client renders and the server validates against.
- **`roomHotspots.js`** — the 4 searchable hotspots per room (24 total: `ROOM_HOTSPOTS`
  + `HOTSPOT_BY_ID`) with normalized `(x,y)` positions. Imported by the client (draw
  indicators + proximity) and the validator/server (place + check clues). Holds **no
  clue mapping**, so it's safe to ship to a client.
- **`caseSchema.js`** — `validateCase(caseData)`: a real solvability proof (see §8).

---

## 5. Critical Design Patterns

- **Server-authoritative state.** Clients send intents; the server validates and is
  the sole authority. The render loop is purely visual; the **game clock** is the
  server's `setTimeout`s.
- **Per-client view filtering.** One serializer (`buildView`) — if a field isn't
  added there, it can't reach a client. The opponent is a 4-field summary.
- **Case-JSON validation with retry/fallback.** Every case is proven solvable before
  play; a bad case fails loudly in dev and falls back to the baked one.
- **Dialogue-tree branch resolution.** `tryAsk` / `tryConfront` return exactly one
  branch; the full tree never leaves the server.
- **Action lockout after lock-in.** Once `p.accusation` is set, every gameplay method
  short-circuits:

```js
tryInvestigate(id) {
  const p = this.player(id);
  if (p.accusation) return { ok: false, locked: true, error: "You've locked in — investigation is closed." };
  ...
}
```
  (The same guard is in `setRegion`, `tryAsk`, and `tryConfront`; the client also
  grays every action and freezes input.)
- **Client-side searching state (no protocol change).** Examining a hotspot enters a
  2.5s *searching* state in `App` (`examining = { hotspotId }`): `BoardCanvas` draws a
  cycling-dots speech bubble + magnifier (`drawSearching`) and input is locked. After
  2.5s the client fires the existing `net.examine` and opens the result modal — so the
  opponent still only sees the ambient note once the examine **commits**, never that an
  animation is running. `prefers-reduced-motion` skips straight to the result, and a 5s
  safety timeout resets a wedged search. (Audio hooks are stubs until Phase 2.4.)
- **Sprint is a client-side speed multiplier.** Holding **Shift** sets `Character.sprint`,
  doubling the per-frame step in `Character.update`. No protocol change: the server is
  still authoritative — `setRegion` only records *which room* a client entered and never
  trusts pixel positions, and the collision geometry (`isWalkable`) is shared, so faster
  local movement can't reach anywhere a walking player couldn't.

---

## 6. Security / Anti-Cheat

`buildView()` (`server/views.js`) is the single most important file for fairness:

```js
opponent: opp ? {
  name: opp.name,
  character: opp.character,
  clueCount: room.progressCount(opp),   // normalized (herrings excluded)
  lockedIn: opp.lockedIn,
  connected: opp.connected,
} : null,
```

- **The solution never reaches a client** until `game:reveal`. `publicCase()` ships
  only the cast list, victim name, weapon names, and room labels — never the
  solution, clue text/`eliminates`, or red herrings.
- **All moves are server-validated.** `region:enter` is re-checked server-side; the
  collision geometry (walls/doorways) is enforced client-side every frame from the
  *shared* module, so it cannot drift from the server's notion of a room.
- **All clue pickups are server-validated.** `tryExamine` reveals the clue at an
  examined hotspot only when its room matches the player's current room and the spot
  hasn't been examined; the `eliminates` key is stripped. **The hotspot→clue mapping
  is never serialized** — a player learns what's at a hotspot only by standing there
  and examining it.
- **Dialogue trees are never sent in full** — only the active branch (`tryAsk` /
  `tryConfront`).
- **Question budget is enforced server-side** — `QUESTION_CAP` (3) per suspect per
  player, tracked in `questionsUsed`.
- **Post-accusation actions are rejected server-side** (see §5).
- The boundary is **test-covered**: `server/test/lobbyFlow.js` asserts the strings
  `"solution"`, `"eliminates"`, `"red_herring"`, `"culprit"`, `"dialogue_tree"`, and
  sample prose never appear in any view payload; `lockout.js` asserts post-lock-in
  rejection.

---

## 7. Game Loop / State Machine

```
        room:create / room:join
LOBBY ───────────────────────────▶ PLAYING ───────────────────────────▶ ENDED ──▶ game:reveal
  │     (2nd player → room.start())   │   examine · question · accuse       │
  │                                   │                                     │
  │                            accuseGate opens ACCUSE            resolve() triggered by:
  │                                   │                            • both locked in
  │                            first lock-in →                     • opponent window closes
  │                            startFinalWindow()                  • soft timer expires
  └─ disconnect → peer:status, 30s cleanup
```

A session: two clients connect → create/join → on the second join the server
generates+validates the case, sets `status = "playing"`, and `scheduleForceResolve`
arms the soft cap. Players investigate/question freely. After `accuseGate`, `ACCUSE`
unlocks; the first `accuse:lock` cancels the soft cap and opens the opponent's final
window. **`resolve()` is computed exactly once** — guarded on `status === "ended"`,
it returns `null` on later calls, so the soft timer, the window timer, and a second
lock-in can all *try* to resolve but only the first wins. The reveal (solution +
both accusations + scores) is pushed to both players in one `game:reveal`.

### Scoring (`GameRoom.scoreFor` / `resolve`)
| Component | Rule |
|-----------|------|
| **Base** | +1 each for a correct culprit, weapon, and room (max 3) |
| **Reasoning** | +1 per cited clue that genuinely supports the solution, capped at +3 |
| **Speed** | among **fully-correct** accusations, earliest +2, the rest +1 |

A clue "supports the solution" only if it eliminates real candidates and never
contradicts the truth — so citing your own red herring earns nothing.

### Socket event reference
| Direction | Event | Payload (in → ack/out) |
|-----------|-------|------------------------|
| c → s | `room:create` | `{ name, devMode }` → `{ ok, code, token, view }` |
| c → s | `room:join` | `{ code, name }` → `{ ok, code, token, view }` |
| c → s | `region:enter` | `{ room, inCorridor }` → `{ ok, room, inCorridor, changedRoom }` |
| c → s | `hotspot:examine` | `{ hotspotId }` → `{ ok, found, hotspotName, clue? }` |
| c → s | `suspect:ask` | `{ suspectId, questionId }` → `{ ok, answer, asked, cap }` |
| c → s | `suspect:confront` | `{ suspectId, clueId }` → `{ ok, response, hadTell }` |
| c → s | `accuse:lock` | `{ culpritId, weaponId, roomId, clueIds }` → `{ ok }` |
| c → s | `state:request` | `{}` → `{ ok, view }` |
| s → c | `game:start` / `state:update` | the player's filtered `view` |
| s → c | `chat` | `{ who, character, text, kind }` (vague/ambient only) |
| s → c | `peer:status` | `{ connected }` |
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
eliminations `clue.eliminates = { suspects:[ids], weapons:[ids], rooms:[ids] }` and a
`clue.hotspot` placing them on a specific furniture spot in `clue.found_in`.

**Validation rules** (`validateCase`):
- **Structure/counts** — exactly 6 suspects, 6 weapons, and the 3/4/4/1/1 clue split;
  the solution references real ids.
- **Solvability** — using only shared + their own private clues, *each* detective's
  surviving candidates collapse to exactly one suspect / weapon / room, matching the
  solution.
- **Integrity** — real clues never eliminate the true culprit/weapon/room; red
  herrings *must* contradict the solution (so a herring is exposed once the real
  clues are in).
- **Dialogue** — every suspect has an answer for all 10 question ids and at least one
  evidence response with a behavioral `tell`, keyed to a real clue id.
- **Hotspots** — every clue's `hotspot` is a real hotspot in its own room, and no two
  of a player's clues share a hotspot (one clue per hotspot per player).

**Retry logic (Phase 2.1):** the live call will attempt generation up to **3 times**,
running each result through `validateCase`, and fall back to the baked, pre-validated
`fallbackCase.json` on any failure. **Note:** live API integration is Phase 2 work;
the game currently runs on the pre-validated fallback case so it's playable with no
key — the validator already runs on every load (`server/test/caseValidation.js`).
