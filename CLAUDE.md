# Project Context for Claude Code

> Read this first at the start of every session. It's the fast path to full context.
> **Last updated:** 2026-07-02

## What This Project Is

**Whispers at Ravenhurst** — a 2-player online deduction game with AI-generated
murder mysteries set in a storm-sealed Victorian manor. React + HTML5 Canvas
frontend, Node.js + Express + Socket.io backend, server-authoritative and
cheat-proof; built as a portfolio piece.

## Current Phase

**Phase 2 (Polish & Immersion) — mostly done.** Phase 1 (vertical slice) is fully
complete. Audio **Pass 1 (2.4a) AND Pass 2 (2.4b) are both done** — footsteps,
examination sfx, tick burst, mute (2.4a) + rain bed, random creaks, UI click,
notebook-open, accusation-lock-in / reveal stings (2.4b). A few ambient/UI clips are
deferred (wind + thunder, distant footsteps, whispers, modal open/close). The next
item is **Phase 2.5 (speech bubbles + idle animations)**. See [ROADMAP.md](ROADMAP.md)
for the full per-item breakdown.

## Recent Work (Last Session)

- **2.4b — Ambient + UI + dramatic audio.** Added 7 CC0 clips to `sound.js` (same
  preload/volume/mute pattern as 2.4a): a quiet looping **rain bed** (vol **0.12**,
  deliberately below every gameplay sound), **random door/floor creaks** on a **30–90s**
  self-rescheduling timer (picks one, only during the `playing` phase), a **UI button
  click** on the primary action pills (wired in `ActionBar.jsx`), a **notebook-open**
  swish (open-only, not on close), and the **accusation-lock-in** + **reveal** dramatic
  stings. Rain lifecycle in `App.jsx`: starts with gameplay, stops at the reveal / on
  return to lobby, **resumes on unmute** (effect keyed on `inGame` + `soundOn`).
  Everything is mute-aware (routes through the same `fire`/`startLoop` guards). Extended
  the dev-only `window.__wrAudio` handle with a `fire.*` map so e2e can trigger the
  creaks/stings deterministically. Verified by the new **`.shots/audio-2.4b-test.mjs`**
  (30 checks, 2-tab: rain + clicks + notebook exercised for real, **reveal via the real
  dev-mode soft-cap force-resolve**, creaks/lock-in via the `fire.*` handle); 2.4a suite
  + standalone server tests still green; prod build clean. ⚠️ `rain_loop.mp3` is **~19 MB**
  — flagged in `CREDITS.md` for re-encoding before launch. *Deferred* (intentionally):
  wind + thunder (storm bed is rain-only), distant footsteps, whispers, modal open/close.
- **Timer-expiry verification (0:00 force-resolve).** Playtest reported the game not
  ending at 0:00. Investigated the full chain and found the code **correct**: server
  arms the soft cap in `rooms.js` (`scheduleForceResolve` on join) → `resolveGame`
  emits `game:reveal` + a final `state:update` → client `App` `net.on("game:reveal")`
  → renders `RevealScreen`, which **unmounts the board** (rAF + key listeners torn
  down, so movement is dead). Reproduced end-to-end in a real browser (Dev Mode, 60s):
  reveal auto-appears on both tabs, both show **Forfeited**, truth + draw shown, Play
  Again → lobby. Conclusion: the playtest bug was a **stale zombie dev server** running
  old code, NOT a regression. **Testing gap closed:** `server/test/accusation.js` only
  tests `resolve()` in isolation (sets `startedAt`, calls `resolve()` directly);
  `lobbyFlow.js` [11] covers the server-socket soft-resolve but needs a running
  `WHISPERS_FAST_TIMERS=1` server; nothing exercised the **React client's
  `game:reveal` handling** until the new e2e **`.shots/timer-expiry-test.mjs`** (2-tab,
  Dev-Mode timers). Lesson: always confirm you're testing a **fresh** server — a
  long-lived zombie can mask/fake bugs.
- **Zombie-server guard in `scripts/dev.js`.** `npm run dev` now **frees the dev ports
  (3001, 5173) before starting** — it detects and kills any process already bound to
  them (cross-platform: `netstat`+`taskkill` on Windows, `lsof`+`SIGKILL` on \*nix) and
  **logs each kill** (`[dev] port 3001 was in use — killed stale process pid …`), so the
  zombie-server trap that faked the 0:00 "bug" can't recur. Clear ports log a green
  "no zombies" line.
- **Accusation-timing e2e coverage.** New **`.shots/accuse-timing-e2e.mjs`** gives the
  two ACCUSE-driven endgame paths real 2-tab browser coverage alongside the no-accuse
  path: **S8** — one player accuses, the other stays silent → the **30s opponent window**
  closes → the non-accuser **auto-forfeits**, submitter wins; **S9** — **both** accuse →
  reveal fires **immediately on the 2nd lock-in** (well under the window/soft-cap), no
  forfeits. Together with `timer-expiry-test.mjs` (S1, soft-cap double forfeit), all
  three critical accusation-timing paths are now covered in-browser, not just at the
  socket level (`lobbyFlow.js` [11]).
- **2.4a** — **Critical sound integration.** `client/src/game/sound.js` is now a real
  HTML5-`<audio>` manager (6 preloaded CC0 clips, per-sound volumes, autoplay-unlock on
  first gesture, global mute). Wired: walk/sprint **footsteps** (transition-driven in
  `BoardCanvas`, no per-frame restarts), the **2.5s searching loop**, **clue-found** /
  **nothing-found** dings, and a one-shot **~3s tick burst** at the 1:00 mark (replaced
  the old synthesized tick). Menu **Sound: ON/OFF** persists in `localStorage`. Verified
  by `.shots/audio-test.mjs` (30 checks). Credits: `client/public/sounds/CREDITS.md`.
- **2.3a** — Modal **Enter/Esc** close shortcuts + **Shift sprint** (2× move speed).
- **2.3b** — **Searching animation**: pressing E starts a 2.5s "searching" state
  (input locked) before the result modal.
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
  mark** (one-shot `tick_burst.mp3`, fired once), then **visual urgency only** (red
  timer + red edge vignette + red ACCUSE) for the final minute. No banners.
- **Examine flow:** walk to a hotspot → press **E** (or click it) → **2.5s searching
  animation** (cute white cloud bubble + looping searching sfx, input locked) → result
  modal with a **clue-found ding** or **nothing-found whoosh**. `prefers-reduced-motion`
  skips the 2.5s (and its loop).
- **Audio (2.4a + 2.4b):** one HTML5-`<audio>` manager in `client/src/game/sound.js` —
  the ONLY place sounds are defined/played. Footsteps are wired in `BoardCanvas`; the UI
  button click in `ActionBar`; everything else (searching / clue / nothing / tick burst,
  and 2.4b's rain lifecycle, creak scheduler, notebook-open, accusation-lock-in, reveal)
  in `App`. Global mute is the menu toggle, persisted in `localStorage` (`wr.soundOn`);
  muting stops all playing sound (incl. the rain bed) and unmuting **resumes the rain**.
  Nothing plays until `unlockAudio()` runs on the first user gesture. Dev-only
  `window.__wrAudio` handle mirrors `window.__wrChar` for e2e (now also exposes a `fire.*`
  map for deterministically triggering the one-shots).
- **Rain bed (2.4b):** a single quiet loop (vol **0.12**) under the whole game — App
  owns its lifecycle (start on gameplay, stop at reveal / lobby, resume on unmute). It
  MUST sit below all gameplay-critical sounds in the mix; don't raise it above footsteps.
- **Random creaks (2.4b):** a 30–90s self-rescheduling timer plays EITHER a door OR a
  floor creak (never both), only during the `playing` phase; each tab runs its own
  scheduler (players hear their own ambient creaks — this is not a leak).
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

- **Deferred audio clips** — Pass 1 (2.4a) and Pass 2 (2.4b) are DONE. Still to source
  + slot into `sound.js` later: **wind + thunder** (storm bed is rain-only), **distant
  footsteps**, **whispers**, and the **modal open/close** pair. List at the bottom of
  this file. Also re-encode **`rain_loop.mp3` (~19 MB)** to a smaller seamless loop.
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
  keys, searching animation, cute bubble, **audio Pass 1 (2.4a)** and **Pass 2 (2.4b:
  rain bed + creaks + UI click + notebook + dramatic stings)** all ✅ (a few ambient/UI
  clips deferred); **Phase 2.5 (speech bubbles + idle animations) is next**.
- **Phase 3 (Content Expansion):** 🔜 planned (live API, maps 2/3, multi-floor).
- **Phase 4 (Launch):** 🔜 planned.

## How To Continue Work

When the user starts a new session:
1. Read this file first.
2. Read [ROADMAP.md](ROADMAP.md) for the status of every phase/item.
3. Ask the user **"Where would you like to continue?"** and show the pending items
   from the Active TODOs above.
4. **Default suggestion: Phase 2.5 (speech bubbles + idle animations)** — the next polish
   step now that audio Pass 1 (2.4a) and Pass 2 (2.4b) both ship. *(Optional smaller
   audio follow-up:* the deferred clips — wind + thunder for the storm bed, distant
   footsteps, whispers, modal open/close — slot straight into `sound.js` when sourced.)

## User Preferences (Important)

- Communication: **casual, Hinglish-friendly**; honest and **direct over hedging**.
- Values **pragmatic engineering** over theoretical perfection.
- Prefers **small, focused passes** over big bundled changes — don't expand scope.
- **Approve before** any major architecture/scope change.
- Cares deeply about **portfolio quality** (recruiter impressions).
- Likes work **verified end-to-end** (2-tab puppeteer playtests + screenshots) and
  **committed + pushed** to GitHub when done.

## Tools / Commands Reference

- `npm run dev` — start server (:3001) + client (:5173) together. **Frees the dev
  ports first** (kills any process already bound to 3001/5173 and logs it) so a stale
  zombie server can never mask fresh code — see `scripts/dev.js`.
- `npm run install:all` — install client + server dependencies.
- `npm run server` / `npm run client` — run each separately.
- **Server tests:** `cd server && node test/<name>.js` — `caseValidation`,
  `accusation`, `movement` run standalone; `lobbyFlow`, `lockout`, `hotspots` need a
  running server (start it with `WHISPERS_FAST_TIMERS=1` for the timer-transition
  tests, or `=demo` for an open accuse gate + long game).
- **e2e:** puppeteer scripts in `.shots/*.mjs` (drive 2 real Chrome tabs; use the
  dev-only `window.__wrChar` handle for precise movement and `window.__wrAudio.state()`
  for audio assertions; reduced-motion skips the 2.5s search). Audio suite:
  `.shots/audio-test.mjs` (launch Chrome with `--autoplay-policy=no-user-gesture-required`).
  **Accusation-timing suite (all against a normal Dev-Mode `npm run dev`):**
  `.shots/timer-expiry-test.mjs` (S1: nobody accuses → soft-cap double forfeit) and
  `.shots/accuse-timing-e2e.mjs` (S8: window auto-forfeit · S9: both accuse → immediate
  reveal).
- **Dev Mode:** lobby checkbox → short timers (60s / 20s / 30s) for fast testing.
- **Git:** project repo is `whispers-at-ravenhurst` → GitHub `Naman9245/whispers-at-ravenhurst`
  (commit messages end with the `Co-Authored-By: Claude` trailer).

## Sound Assets TODO

Source CC0 from freesound.org / pixabay / mixkit. All sounds live in
`client/src/game/sound.js`; add a new clip = one entry in its `SOUNDS` map + a named
`play…()` export, then call it from the event site. Log each file in
`client/public/sounds/CREDITS.md`.

### Pass 1 — Critical (2.4a) ✅ DONE
- ✅ Searching loop (`examination/searching.mp3`) — `playSearching` / `stopSearching`
- ✅ Clue-found ding (`examination/clue_found.mp3`) — `playClueFound`
- ✅ Nothing-found whoosh (`examination/nothing_found.mp3`) — `playNothingFound`
- ✅ Footsteps walk + sprint (`movement/footsteps_{walk,sprint}.mp3`) — `playFootsteps*`
- ✅ Tick burst (`timer/tick_burst.mp3`, ~3s at the 1:00 mark) — `playTickBurst`

### Pass 2 — Ambient + UI + dramatic (2.4b) ✅ DONE
**Ambient**
- ✅ Rain bed loop (`ambient/rain_loop.mp3`, vol 0.12) — `playRainLoop` / `stopRainLoop`
- ✅ Random door creak (`ambient/door_creak.mp3`) — `playDoorCreak` (30–90s scheduler)
- ✅ Random floor creak (`ambient/floor_creak.mp3`) — `playFloorCreak` (30–90s scheduler)

**UI**
- ✅ Button click (`ui/button_click.mp3`) — `playButtonClick` (primary action pills)
- ✅ Notebook open (`ui/notebook_open.mp3`) — `playNotebookOpen` (open-only)

**Dramatic**
- ✅ Accusation lock-in sting (`dramatic/accusation_lockin.mp3`) — `playAccusationLockIn`
- ✅ Reveal-screen unveiling (`dramatic/reveal.mp3`) — `playReveal`

### Deferred to a later polish pass 🔜
**Ambient**
- Storm layers: **thunder + wind** (the bed is rain-only for now)
- Random distants: **footsteps elsewhere**, **whispers**

**UI**
- **Modal open / close** (the ExamineModal/SuspectModal/AccusationModal backdrops)

> Reminder: re-encode **`rain_loop.mp3` (~19 MB)** to a smaller seamless loop before launch.
