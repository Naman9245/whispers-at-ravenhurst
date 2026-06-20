# Architecture — Whispers at Ravenhurst

> **Last updated:** 2026-06-16

A technical deep-dive into how the game is built: the server-authoritative model,
the privacy boundary that makes it cheat-proof, the shared geometry layer, the
canvas render loop, and the case-generation pipeline. Every function and path
referenced below exists in the codebase as written.

---

## 1. System overview

```
┌──────────────────────────┐         WebSocket (Socket.io)         ┌──────────────────────────┐
│        CLIENT A           │  ── intents ──▶                        │         SERVER            │
│  React + Canvas (Holmes)  │   region:enter / investigate /         │  Node + Express +         │
│                           │   suspect:ask / accuse:lock            │  Socket.io                │
│  renders ONLY its own     │  ◀── filtered view ──                  │                           │
│  detective + its own view │   game:start / state:update /          │  RoomStore → GameRoom     │
└──────────────────────────┘   chat / game:reveal                    │  (authoritative state)    │
                                                                     │                           │
┌──────────────────────────┐                                        │  buildView() filters      │
│        CLIENT B           │  ◀──────────────────────────────────▶  │  per-player before send   │
│  React + Canvas (Watson)  │                                        └─────────────┬─────────────┘
└──────────────────────────┘                                                       │
                                                          imports ▼                ▼ imports
                                                  ┌──────────────────────────────────────────┐
                                                  │   /shared  (single source of truth)        │
                                                  │   mapData · constants · questions · schema │
                                                  └──────────────────────────────────────────┘
```

**Three packages, one rulebook.** The client and server are separate npm
packages, but both import `/shared` so the map graph, rule constants, question
pool, and case schema can never drift between them. The client's
`client/src/game/boardData.js` is literally a one-line re-export:

```js
// client/src/game/boardData.js
export * from "@shared/mapData.js";
```

**Core principle: clients send *intents*, never state.** A client asks to enter a
room or lock in an accusation; the server validates, mutates the authoritative
state, and pushes back a per-player **view**. The client never tells the server
where it "is" in a way the server trusts blindly — and it never learns anything
the rules say it shouldn't.

---

## 2. Server architecture

### 2.1 Wiring (`server/index.js`)

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

### 2.2 The room registry (`server/rooms.js`)

`RoomStore` keeps a `Map<code, GameRoom>` in memory. Room codes are 5 characters
from an unambiguous alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no `0/O`,
`1/I`). `registerLobby` handles `room:create` (creator becomes **Holmes**) and
`room:join` (joiner becomes **Watson**); when the second player joins, the room
auto-starts:

```js
if (room.isFull()) {
  await room.start();
  scheduleForceResolve(io, room);          // soft-timer cap on the whole game
  for (const p of room.players) io.to(p.id).emit("game:start", room.viewFor(p.id));
}
```

`handleDisconnect` flags the player `connected = false`, notifies the opponent via
`peer:status`, and schedules cleanup after `RECONNECT_WINDOW_MS` (30 s).

### 2.3 The rules engine (`server/game.js`)

`GameRoom` is the heart of the server: it owns player records, the case data
(including the solution), clue/question/accusation state, and the timers. Key
methods, grouped by subsystem:

| Subsystem      | Methods |
|----------------|---------|
| Lifecycle      | `addPlayer`, `removePlayer`, `isFull`, `start` |
| Movement       | `setRegion` (validates room changes against the graph) |
| Investigation  | `tryInvestigate`, `cluePoolFor`, `progressCount`, `foundCluesFor` |
| Questioning    | `tryAsk`, `tryConfront`, `questioningStateFor` |
| Accusation     | `accuseOpensAt`, `tryLock`, `startFinalWindow`, `scoreFor`, `resolve` |
| Serialization  | `viewFor` (delegates to `buildView`) |

Each player record is created in `addPlayer` and is the only place the
authoritative per-player data lives:

```js
const player = {
  id,                  // current socket id
  token: cryptoId(),   // stable id for reconnects (planned)
  name, character,     // "holmes" | "watson"
  room: START_ROOM,    // authoritative room occupancy (private)
  inCorridor: false,
  clues: [],           // ids found (private)
  investigated: [],    // rooms searched (private)
  questionsUsed: {},   // suspectId -> count
  confronted: {},      // suspectId -> [clueIds used as evidence]
  lockedIn: false,
  accusation: null,    // payload (private until reveal)
  connected: true,
};
```

### 2.4 The handlers (`server/handlers/`)

Each handler is thin: validate via a `GameRoom` method, ack the caller privately,
emit a **vague** ambient line to both players, then push fresh views.

- **`movement.js`** — `region:enter`. The client free-roams in pixel space and
  reports which room it entered (or that it stepped into the corridor).
  `setRegion` rejects moves to non-adjacent rooms (`areAdjacent`). Positions are
  never broadcast; only a "moved to another room…" note is.
- **`investigate.js`** — `investigate`. `tryInvestigate` reveals all of the
  player's clues for their current room at once, marks it searched for that player
  only, and strips the machine-readable `eliminates` key before returning.
- **`suspects.js`** — `suspect:ask` (one dialogue branch, budget-capped) and
  `suspect:confront` (an evidence branch that may carry a behavioural tell). The
  full dialogue tree never reaches a client.
- **`accusation.js`** — `accuse:lock`, plus `resolveGame` and
  `scheduleForceResolve`. The first lock-in cancels the soft cap and opens the
  opponent's final window:

```js
if (room.lockedCount() === 1) {
  clearTimeout(room._softTimer);
  room.startFinalWindow();
  room._windowTimer = setTimeout(() => resolveGame(io, room),
                                 room.timers.opponentWindow * 1000);
}
```

---

## 3. The privacy boundary / anti-cheat (`server/views.js`)

This is the single most important file for fairness. **`buildView()` is the only
function that turns server state into something sent to a client.** Nothing else
serializes game state.

It exposes the requesting player's own data in full but reduces the opponent to a
four-field summary — no position, no clue contents, no notebook:

```js
opponent: opp ? {
  name: opp.name,
  character: opp.character,
  clueCount: room.progressCount(opp),   // normalized (herrings excluded)
  lockedIn: opp.lockedIn,
  connected: opp.connected,
} : null,
```

A separate `publicCase()` helper strips the case down to facts both detectives are
entitled to — the cast list, victim name, weapon names, room labels — and
**deliberately omits the solution, every clue's text and `eliminates` key, and the
red herrings.** During the accusation phase the view carries only timing data and
lock **flags** (`youLocked`, `opponentLocked`, `finalDeadline`) — never the
opponent's chosen culprit/weapon/room/clues. Those appear solely in the final
`game:reveal`.

This boundary is covered by tests: `server/test/lobbyFlow.js` asserts that the
strings `"solution"`, `"eliminates"`, `"red_herring"`, `"culprit"`,
`"dialogue_tree"`, and `"evidence_responses"`, plus sample clue/answer prose,
never appear in any view payload.

---

## 4. The shared layer (`/shared`)

### 4.1 Rules & constants (`constants.js`)

All tunables that both sides must agree on:

```js
export const MOVE_SPEED = 160;            // px/sec at internal board resolution
export const QUESTION_CAP = 3;            // pooled questions per (player, suspect)
export const TIMER_PRESETS = {
  production: { softTimer: 600, accuseGate: 180, opponentWindow: 120 },
  dev:        { softTimer: 60,  accuseGate: 20,  opponentWindow: 30  },
};
export const CLUE_DISTRIBUTION = { shared: 3, privatePerPlayer: 4, redHerringPerPlayer: 1 };
export const PROGRESS_TOTAL = 7;          // 3 shared + 4 private (identical for both)
```

### 4.2 Map & walkable geometry (`mapData.js`)

Six rooms in a 3×2 grid joined by a single horizontal corridor. `CONNECTIONS`
defines the edges; `ADJACENCY` is the O(1) lookup the server uses to gate
movement. The same module also defines the **collision geometry** the client uses
for free-roam movement:

- `roomInterior(id)` / `CORRIDOR_INTERIOR` — the rectangles a player may stand in,
  inset by `WALL_INSET` (16 px) from the visual walls.
- `doorwayRect(id)` — the gap (half-width `DOOR_HALF` = 30 px, matched to the
  drawn door) that bridges a room and the corridor.
- `isWalkable(x, y, openRoomIds)` — the core collision test, evaluated against the
  player's **feet** position:

```js
export function isWalkable(x, y, openRoomIds) {
  if (inRect(x, y, CORRIDOR_INTERIOR)) return true;
  for (const id of openRoomIds) {
    if (inRect(x, y, roomInterior(id)) || inRect(x, y, doorwayRect(id))) return true;
  }
  return false;
}
```

`openRoomIds` is the current room plus its graph-neighbours, so the connection
graph still gates which rooms you can physically walk into.

### 4.3 Questions (`questions.js`)

A flat `QUESTION_POOL` of ten Victorian-detective questions, each with a stable
`id`. The server validates `questionId` against `QUESTION_IDS` and looks up the
answer in the case's dialogue tree; the client just renders the list.

### 4.4 Case schema & validator (`caseSchema.js`)

`validateCase(caseData)` is a real solvability proof, not a shape check. A clue
carries machine-readable eliminations:

```js
clue.eliminates = { suspects: [ids], weapons: [ids], rooms: [ids] };
```

The validator confirms that, using only the shared clues plus their own private
set, **each** detective's surviving candidates collapse to exactly one
suspect / one weapon / one room, and that those match the solution. It also proves
real clues never contradict the truth and that red herrings genuinely do (so a
herring is exposed once the real clues are in). This runs at game start and in
`server/test/caseValidation.js`.

---

## 5. Client architecture

### 5.1 App shell (`client/src/App.jsx`)

`App` holds top-level phase (`lobby` → `playing` → reveal), wires the Socket.io
event listeners once, and derives all accusation timing each 1-second heartbeat.
Rendering is driven entirely by the `view` the server pushes:

- `net.on("game:start", …)` and `net.on("state:update", …)` call `applyView`,
  which also records the server-clock offset for countdown sync.
- `net.on("chat", …)`, `net.on("peer:status", …)`, `net.on("game:reveal", …)`
  feed the log, the connection toast, and the reveal screen.

Accusation timing is computed from the view's `accusation` block — gate countdown,
time-left-to-act, and the urgency tier (shared with the timer via
`urgencyTier`) — which drives the ACCUSE button's live countdown, the open/urgent
notifications, the tick-sound cadence, and the final-30 s vignette.

### 5.2 Networking (`client/src/net/socket.js`)

A thin promise wrapper over Socket.io. Every intent is an `emit` whose ack
resolves a promise:

```js
export const net = {
  createRoom: (name, devMode) => ask("room:create", { name, devMode }),
  joinRoom:   (code, name)    => ask("room:join", { code, name }),
  enterRegion:(room, inCorridor) => ask("region:enter", { room, inCorridor }),
  investigate:()              => ask("investigate", {}),
  askSuspect: (suspectId, questionId) => ask("suspect:ask", { suspectId, questionId }),
  confrontSuspect:(suspectId, clueId) => ask("suspect:confront", { suspectId, clueId }),
  accuse:     (payload)       => ask("accuse:lock", payload),
  on, off,
};
```

### 5.3 The canvas renderer (`client/src/game/`)

The board is drawn on a single `<canvas>` at a fixed internal resolution
(`BOARD_W × BOARD_H`) and CSS-scaled to fit. There is no game engine.

- **`BoardCanvas.jsx`** owns a `requestAnimationFrame` loop. Each frame it reads
  the WASD/arrow key state into an input vector, advances the `Character`, then
  draws the board and the player's own sprite. The opponent is never drawn.
- **`Character.js`** owns the detective's pixel position (its **feet**), facing,
  animation, and "anchor room." Movement integrates the input vector at
  `MOVE_SPEED` and resolves collisions by trying the full move, then sliding along
  whichever axis stays walkable:

```js
if (isWalkable(nx, ny, open))      { this.x = nx; this.y = ny; }
else if (isWalkable(nx, this.y, open)) { this.x = nx; }
else if (isWalkable(this.x, ny, open)) { this.y = ny; }
```

  When the feet cross into a new room (or the corridor), `onRegionChange` fires and
  `App` reports it to the server via `net.enterRegion`.
- **`drawBoard.js`** is pure drawing — rooms, per-room furniture, doorways, the
  current-room glow, and reachable-room highlights. **`sprites.js`** loads frames
  from `public/assets/sprites.json` into an image cache the loop draws cheaply.

### 5.4 Components & audio

The HUD/notebook/modals are plain React: `PlayerHud`, `ActionBar`, `TimerBar`
(exports `urgencyTier`), `ClueTracker`, `ChatLog`, `DeductionNotebook`,
`SuspectModal`, `AccusationModal`, `RevealScreen`. `game/sound.js` is a tiny
Web-Audio bank (`unlockAudio`, `playTick`, `playChime`, `playAlarm`) — all
synthesized, so it adds no download weight; it's unlocked on the first user
gesture to satisfy autoplay policy.

---

## 6. Critical design patterns

### 6.1 The game loop (client) vs. the clock (server)

The **render loop** (client `requestAnimationFrame`) is purely visual — movement,
animation, region detection. The **game clock** is server-owned: `GameRoom.timers`
plus `startedAt` define when the accuse gate opens, when the soft cap forces
resolution, and when an opponent's window closes. The client renders countdowns
from the server clock (offset-corrected) but the server's `setTimeout`s are the
authority that actually ends the game.

### 6.2 Scoring (`GameRoom.scoreFor` / `resolve`)

Three additive components:

| Component   | Rule |
|-------------|------|
| **Base**    | +1 each for a correct culprit, weapon, and room (max 3) |
| **Reasoning** | +1 per cited clue that genuinely supports the solution, capped at +3 |
| **Speed**   | among **fully-correct** accusations, earliest +2, the rest +1 |

A clue "supports the solution" (`_supportsSolution`) if it eliminates real
candidates and never contradicts the truth — so citing your own red herring earns
nothing. The winner(s) are whoever has the maximum total; a non-submitter forfeits
with a score of 0.

### 6.3 Game end is computed exactly once

`resolve()` guards on `status === "ended"` and returns `null` on subsequent calls,
so the soft timer, the opponent window, and a second lock-in can all *try* to
resolve, but only the first wins. The reveal (solution + both accusations +
scores) is built there and pushed to both players in a single `game:reveal`.

---

## 7. AI case-generation pipeline (`server/ai/`)

```
room.start()
   └─▶ generateCase({ devMode })            // server/ai/generateCase.js
          ├─ loadFallbackCase()             // reads ai/fallbackCase.json
          ├─ validateCase(case)             // shared/caseSchema.js — solvability proof
          └─ returns the case (solution included — SERVER ONLY)
```

`generateCase()` currently always returns the **baked, validated** case, so the
game is playable for anyone — including portfolio reviewers with no API key. The
key is read from `process.env.ANTHROPIC_API_KEY` on the server only and is never
sent to a client. The live `claude-opus-4-8` generation call (with retry ×3,
falling back to the baked case on any failure or validation miss) is the next
slot-in at the marked point in `generateCase()` — see
[ROADMAP.md](ROADMAP.md), Phase 3.

The baked case (`fallbackCase.json`) contains the narrative, six suspects, six
weapons, the clue sets (3 shared / 4 + 4 private / 1 + 1 herrings), and the
per-suspect dialogue trees (one answer per pooled question, plus evidence
responses with behavioural tells). It is validated on every load and by
`server/test/caseValidation.js`.

---

## 8. Socket event reference

| Direction        | Event              | Payload (in → ack/out) |
|------------------|--------------------|------------------------|
| client → server  | `room:create`      | `{ name, devMode }` → `{ ok, code, token, view }` |
| client → server  | `room:join`        | `{ code, name }` → `{ ok, code, token, view }` |
| client → server  | `region:enter`     | `{ room, inCorridor }` → `{ ok, room, inCorridor, changedRoom }` |
| client → server  | `investigate`      | `{}` → `{ ok, room, revealed[] }` |
| client → server  | `suspect:ask`      | `{ suspectId, questionId }` → `{ ok, answer, asked, cap }` |
| client → server  | `suspect:confront` | `{ suspectId, clueId }` → `{ ok, response, hadTell }` |
| client → server  | `accuse:lock`      | `{ culpritId, weaponId, roomId, clueIds }` → `{ ok }` |
| client → server  | `state:request`    | `{}` → `{ ok, view }` |
| server → client  | `game:start`       | the player's initial `view` |
| server → client  | `state:update`     | a refreshed per-player `view` |
| server → client  | `chat`             | `{ who, character, text, kind }` (vague/ambient only) |
| server → client  | `peer:status`      | `{ connected }` |
| server → client  | `game:reveal`      | `{ solution, monologue, players[], winners }` |
