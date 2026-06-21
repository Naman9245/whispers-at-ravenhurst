# Project Context for Claude Code

> Read this first at the start of every session. It's the fast path to full context.
> **Last updated:** 2026-06-21

## What This Project Is

**Whispers at Ravenhurst** — a 2-player online deduction game with AI-generated
murder mysteries set in a storm-sealed Victorian manor. React + HTML5 Canvas
frontend, Node.js + Express + Socket.io backend, server-authoritative and
cheat-proof; built as a portfolio piece.

## Current Phase

**Phase 2 (Polish & Immersion) — mostly done.** Phase 1 (vertical slice) is fully
complete. The next big item is **Phase 2.4 (Audio)**. See [ROADMAP.md](ROADMAP.md)
for the full per-item breakdown.

## Recent Work (Last Session)

- **2.3a** — Modal **Enter/Esc** close shortcuts + **Shift sprint** (2× move speed).
- **2.3b** — **Searching animation**: pressing E starts a 2.5s "searching" state
  (input locked) before the result modal; audio wired as silent TODO stubs.
- **2.3c** — **Cute white cloud speech bubble** during searching (canvas-rendered).
- Earlier in Phase 2: minimalist fullscreen UI restructure, **hotspot exploration
  system** (flagship), timer-urgency redesign, lock-in action lockout, comprehensive
  docs + `CLAUDE.md`.

## Critical Design Decisions (DO NOT CHANGE WITHOUT ASKING)

- **Server-authoritative** state — clients send *intents*, the server validates &
  owns truth (anti-cheat). The solution never reaches a client until the reveal.
- **Pre-generated dialogue trees** (baked case), NOT a live AI call per question.
- **Dual-window accusation** — production: **20-min soft cap · 5-min accuse gate ·
  3-min final window** (Dev Mode: 60s / 20s / 30s). *(Note: earlier docs said 3-min
  gate / 2-min window — the real values in `shared/constants.js` are 5-min / 3-min.)*
- **Fixed clue counts:** 3 shared + 4 private per player + 1 red herring per player.
- **Suspects are GLOBAL** (questionable from anywhere; not room-bound).
- **Movement = WASD / arrow keys only**, free-roam, with **Shift to sprint** (2×).
  There is **no click-to-move**; a mouse **click only examines a nearby hotspot**
  (proximity-gated, same as pressing E).
- **One privacy boundary:** `server/views.js` `buildView()` is the ONLY serializer
  to clients. The opponent is reduced to `{name, character, clueCount, lockedIn,
  connected}` — never position, clues, notebook, or examined hotspots.
- **Timer urgency:** calm/green the whole game; a **3-second tick burst at the 1:00
  mark** (only sound that currently plays), then **visual urgency only** (red timer +
  red edge vignette + red ACCUSE) for the final minute. No banners.
- **Examine flow:** walk to a hotspot → press **E** (or click it) → **2.5s searching
  animation** (cute white cloud bubble, input locked) → result modal (clue / "Nothing
  of interest here."). `prefers-reduced-motion` skips the 2.5s.
- **Modals** close with **Enter or Esc** (and their buttons).
- **Action lockout after lock-in:** once a player locks in their accusation, the
  server rejects further move/examine/question and the client disables all actions.
- **Hotspot→clue mapping is never sent** to a client until that exact spot is examined.

## File Structure Quick Reference

```
shared/                 # SINGLE SOURCE OF TRUTH (imported by client AND server)
  mapData.js            # rooms, connection graph, walkable geometry, collision
  constants.js          # timers, clue distribution, question cap, move speed
  caseSchema.js         # case JSON shape + solvability + hotspot validator
  roomHotspots.js       # the 4 hotspots per room (24 total) — positions + ids
  questions.js          # the 10-question suspect pool
server/
  index.js              # Express + Socket.io bootstrap; wires handlers per socket
  rooms.js              # RoomStore + lobby (create/join) + disconnect handling
  game.js               # GameRoom: authoritative state machine, rules, scoring,
                        #   tryExamine / tryLock / setRegion / scoreFor / resolve
  views.js              # buildView() — THE per-player privacy boundary
  handlers/             # movement · investigate(hotspot:examine) · suspects · accusation
  ai/                   # generateCase.js (validate + fallback) + fallbackCase.json
  test/                 # node tests: caseValidation, accusation, movement,
                        #   lobbyFlow, lockout, hotspots
client/src/
  App.jsx               # phases (lobby→playing→reveal), event wiring, searching SM
  net/socket.js         # promise-based intent senders (the `net` object)
  game/                 # BoardCanvas.jsx (rAF loop, WASD/E/click), Character.js
                        #   (feet-based collision, sprint), drawBoard.js (board +
                        #   drawHotspots + drawSearching), sprites.js, sound.js
  components/           # PlayerHud, TimerBar, ClueTracker, ActionBar, ActivityLog,
                        #   GameMenu, DeductionNotebook, SuspectModal, AccusationModal,
                        #   ExamineModal, RevealScreen, Lobby
.shots/                 # puppeteer e2e scripts + screenshots (dev artifacts)
```

## Active TODOs (Things to Remember)

- **Phase 2.4 audio assets** — full list at the bottom of this file (all sound is
  currently silent TODO stubs except the synthesized 1:00 tick burst).
- **Live `claude-opus-4-8` API integration** — pipeline + validator exist; the call
  is the slot-in point in `server/ai/generateCase.js`. **Deferred — awaiting API
  credits.** (Tracked under Phase 3.)
- **Maps 2 & 3** — Moonlight Hotel (1920s art-deco), Blackthorn Estate (Gothic).
- **Multi-floor mansion expansion** (Phase 3) — stairs, upstairs/basement, floor
  transitions, multi-floor case generator (~1–2 weeks on its own).
- **Token-based reconnect** — Step 12 completion (disconnect currently = detect +
  30s cleanup, no rejoin).
- **Deployment** — Vercel (frontend) + Railway/Render (backend) in Phase 4.

## What's Done vs What's Left

- **Phase 1 (Vertical Slice):** ✅ DONE
- **Phase 2 (Polish):** 🟡 mostly DONE — UI restructure, hotspots, sprint, modal
  keys, searching animation, cute bubble all ✅; **Audio (2.4) is next**.
- **Phase 3 (Content Expansion):** 🔜 planned (live API, maps 2/3, multi-floor).
- **Phase 4 (Launch):** 🔜 planned.

## How To Continue Work

When the user starts a new session:
1. Read this file first.
2. Read [ROADMAP.md](ROADMAP.md) for the status of every phase/item.
3. Ask the user **"Where would you like to continue?"** and show the pending items
   from the Active TODOs above.
4. **Default suggestion: Phase 2.4 (Audio)** — the next logical polish step (the
   examine/movement/ambient sound hooks are already stubbed and waiting).

## User Preferences (Important)

- Communication: **casual, Hinglish-friendly**; honest and **direct over hedging**.
- Values **pragmatic engineering** over theoretical perfection.
- Prefers **small, focused passes** over big bundled changes — don't expand scope.
- **Approve before** any major architecture/scope change.
- Cares deeply about **portfolio quality** (recruiter impressions).
- Likes work **verified end-to-end** (2-tab puppeteer playtests + screenshots) and
  **committed + pushed** to GitHub when done.

## Tools / Commands Reference

- `npm run dev` — start server (:3001) + client (:5173) together.
- `npm run install:all` — install client + server dependencies.
- `npm run server` / `npm run client` — run each separately.
- **Server tests:** `cd server && node test/<name>.js` — `caseValidation`,
  `accusation`, `movement` run standalone; `lobbyFlow`, `lockout`, `hotspots` need a
  running server (start it with `WHISPERS_FAST_TIMERS=1` for the timer-transition
  tests, or `=demo` for an open accuse gate + long game).
- **e2e:** puppeteer scripts in `.shots/*.mjs` (drive 2 real Chrome tabs; use the
  dev-only `window.__wrChar` handle for precise movement; reduced-motion skips the
  2.5s search).
- **Dev Mode:** lobby checkbox → short timers (60s / 20s / 30s) for fast testing.
- **Git:** project repo is `whispers-at-ravenhurst` → GitHub `Naman9245/whispers-at-ravenhurst`
  (commit messages end with the `Co-Authored-By: Claude` trailer).

## Sound Assets TODO (For Phase 2.4)

Source CC0 from freesound.org / pixabay / mixkit. Hooks already stubbed in
`client/src/game/sound.js` (`playSearchingLoop`, `playClueFound`, `playNothingFound`)
plus the existing synthesized `playTick`/`unlockAudio`/`setMuted`.

**Examination**
- Searching loop (paper rustling / drawer / shuffle, ~2.5s)
- Clue-found ding (~0.5s)
- Nothing-found whoosh (~0.5s)

**Movement**
- Footsteps walking loop
- Footsteps sprinting loop (faster)

**Timer**
- Tick burst (3 seconds at the 1:00 mark) — currently synthesized; may replace.

**Ambient**
- Background loop: rain + thunder + wind
- Random distants: footsteps elsewhere, door creak, whispers, floor creak

**UI**
- Modal open / close
- Button click
- Notebook open / close

**Dramatic**
- Accusation lock-in sting
- Reveal-screen unveiling
