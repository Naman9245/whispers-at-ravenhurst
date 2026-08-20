# Project Context for Claude Code

> Read this first at the start of every session. It's the fast path to full context.
> **Last updated:** 2026-07-02

## What This Project Is

**Whispers at Ravenhurst** — a 2-player online deduction game with AI-generated
murder mysteries set in a storm-sealed Victorian manor. React + HTML5 Canvas
frontend, Node.js + Express + Socket.io backend, server-authoritative and
cheat-proof; built as a portfolio piece.

## Current Phase

**Phase 2 (Polish & Immersion) — DONE, including 2.8.** Phase 1 (vertical slice) is
fully complete. Audio **2.4a + 2.4b**, the **Cinematic Main Menu (2.7)**, **Phase 2.5**
(speech bubbles + procedural idle) and **Phase 2.8** (host-chosen room settings, the
zoom-and-follow camera + manor map, the new stage layout, the case briefing and the
suspect rail) all ship. A few ambient/UI clips remain deferred (wind + thunder,
distant footsteps, whispers, modal open/close). Next up is **Phase 3** — live case
generation, maps 2/3, multi-floor. See [ROADMAP.md](ROADMAP.md) and
[docs/PHASE-2.8-PLAN.md](docs/PHASE-2.8-PLAN.md) for the per-item breakdown.

## Recent Work (Last Session)

- **Phase 2.8 — game modes, camera, the new layout, and Phase 2.5.** Six passes on
  branch `phase-2.8`, each committed and verified separately.
  **(A) Host-chosen room settings** — the lobby's create form now dials the game in
  Among Us style (time limit **Off/15/20/30/45**, accuse gate, rival window, hotspot
  markers, sprint, rival-progress visibility). Shape + whitelist in
  `shared/constants.js`; `room:create` had NO validation, so settings go through
  `sanitizeSettings`. ⚠️ **Two null traps**, both of which silently invert Timer:Off
  because `null * 1000 === 0`: `scheduleForceResolve()` fired on the next tick, and
  `softMs` froze the client clock at 0:00. Guarded with `== null`;
  `server/test/timerOff.js` is the regression.
  **(B) Walk while you wait** — one `setRegion` guard deleted, so a locked-in
  detective can pace the manor. Examine/question/confront stay shut.
  **(C) Zoom-and-follow camera + hidden map** (`client/src/game/camera.js`,
  `MapOverlay.jsx`). The bake moved to **2×** via a pre-scaled bake context, so
  `paintStatic` is untouched and `__wrBoard.bakes` stays **1**. `drawOccluders` reads
  a SOURCE rect out of the bitmap and writes a DEST rect in world units — only the
  source takes the scale, and getting it wrong is silent. The frame is now three
  bands: explicit clear → world under the transform → screen-space UI.
  **(C2) Phase 2.5** — `drawSearching`'s cloud generalised into `drawBubble`, plus
  `bubbles.js` (timestamp-scheduled, zero timers) and procedural idle in `Character`.
  **(D/E/F) The new stage** — race-scoreboard top bar (you | clock | rival, with the
  rival's `LOCKED IN` finally visible), board as hero with the action pills floating
  inside it, a Scenario/Questions/Log strip beneath, and a suspect rail of flip cards.
  The **case briefing** screen finally renders `narrative.opening` + `victim_backstory`,
  which had been reaching the client and rendering nowhere since the first build.
  Verified: new `settings`/`timerOff` server tests + `camera-test.mjs` (24) and
  `layout-test.mjs` (30), with camera/hotspot/searching/overhaul all green.
  **Several pre-existing test failures were found and fixed along the way** — see
  "Testing gotchas" below.
- **Title/tagline overlap — guaranteed fix (retry).** The earlier tagline-pill fix
  only touched the main menu's `.mm-tagline`; the reported overlap was actually the
  **lobby's** `.lobby-tagline` ("A two-detective race to the truth." over DINING HALL),
  a separate element. Replaced the approach with a shared **`.mm-titlecard`** — a
  **fully-opaque** panel (`#181022` base + a subtle sheen gradient, gold border) wrapping
  the title + tagline block on BOTH pre-game screens (menu + lobby), above the canvas /
  below the form card. Nothing from the animated board can bleed through at any drift
  position or width. Verified with screenshots at two drift positions + the lobby Join
  screen; `menu-test.mjs` (47) still green.
- **2.7 bug-fix pass (5 playtest bugs).** (1) **Reliable click sound** — `fire()` in
  `sound.js` now plays a short-lived **clone** per shot (a single `<audio>` can't
  retrigger mid-play → the "sometimes silent" clicks); clones are cached, referenced
  until `ended`, and stopped by `stopAll()`. (2) **Persistent rain** — added a
  `loopIntent` set + an `ended`→restart self-heal on loop elements and a defensive
  `a.loop = true` in `startLoop`, so the bed can't die mid-session. (3a) **Creaks
  regated to `inGame` only** (the continuity fix had broadened them to `ambient`, so
  they fired on menu/lobby); rain stays `ambient`, creaks are gameplay-only. (3b)
  **Begin no longer plays `playDoorCreak()`** — creaks are strictly the random in-game
  scheduler now; Begin uses the standard delegated UI click (dropped its
  `data-sound="off"`). (4) **Ghost separation** in `menuScene.js` — spawn in different
  rooms, exclude the other ghost's current/target room when picking a destination
  (`targetRoom` published), and a per-frame `separateGhosts` repulsion (GHOST_SEP 46px,
  walkable-clamped) so they never overlap. (5) **Tagline overlap** — `.mm-tagline` got
  a semi-opaque pill backdrop anchored to the text, covering any room label behind it
  at any width. Verified: `menu-test.mjs` → **47 checks** (rapid-click reliability,
  ghost min-separation sampling, zero-creaks-in-pre-game, rain-never-stops, Begin
  click-not-creak) + 2.4a/2.4b regressions green.
- **2.7 fix-up — Menu/Lobby visual continuity.** The lobby no longer feels like a
  different app: the idle-mansion scene is extracted into **`MenuBackdrop.jsx`**, and
  App mounts it ONCE in a shared `.pre-game` wrapper covering **menu AND lobby** —
  same tree position across the swap, so React never remounts it (verified in e2e via
  a `__wrMenu` marker that survives menu ⇄ lobby round-trips; it unmounts only when a
  game starts or the reveal shows). Begin Investigation's **fade-to-black is gone** —
  now a ~300ms content-only fade (same scene, new foreground panel; the lobby card
  glides in). **Rain + creaks now carry through the lobby** (`ambient = preGame ||
  inGame` — only the reveal is storm-free). Lobby **Create Room / Join with Code**
  restyled as menu-style `.mm-btn` case-file tabs with icons — icons come from CSS
  `content: attr(data-icon)` so **textContent stays exactly "Create Room" / "Join with
  Code"** (all 17 e2e suites exact-match on it) — plus hover paper-lift + notebook
  swish; room create/join logic untouched. Themed **← Back** button (`.mm-back`):
  lobby top-left (home mode only — never while a room is in flight) → main menu;
  Desk/Case Files footers unified to the same style. Magnifier cursor now covers the
  whole pre-game wrapper. `menu-test.mjs` grew to **41 checks** (continuity marker,
  rain-through-lobby, back round-trip, backdrop-unmounts-in-game, fresh-scene-after-
  reveal) — all green; audio 2.4a/2.4b + timer-expiry suites still green.
- **2.7 — Cinematic Main Menu.** New top-level `phase` state in App: **menu → lobby →
  game → reveal** (`?menu=skip` jumps straight to the lobby — all 17 e2e suites use
  it; reveal's "Main Menu" returns to the menu, "Play Again" stays lobby-bound).
  `MainMenu.jsx` = typewriter title (~0.8s) + random tagline + case-file-tab buttons
  (paper-lift hover + notebook swish; Begin → door creak + 500ms fade → the EXISTING
  lobby) over `menuScene.js` — a pure-canvas idle engine reusing `drawBoard` +
  `Character` + `pathBetween`: two translucent **ghost detectives** wander room→room
  (waypoint steering, **10px arrival radius** — max frame step is 8px — 2s stuck-guard,
  kill-switch `MENU_GHOSTS_ENABLED`), camera drift (1.06 overdraw + sin/cos), room-light
  pulses, ~250ms lightning every 20–30s (visual-only, no thunder asset). **ONE rAF,
  zero timers** — timestamp scheduling makes StrictMode double-mount and remount leaks
  impossible; `stop()` = cancelAnimationFrame. **Detective's Desk**: Sound (shared
  soundOn), Fullscreen (API + `fullscreenchange` sync), **Dev Mode default**
  (`wr.devModeDefault` in localStorage → pre-checks the lobby checkbox; lobby stays the
  per-room source of truth). **Case Files**: fetches + renders `/sounds/CREDITS.md`
  live (~40-line md renderer, no dep), builder credit, repo link, **v0.9.0** from
  package.json (bumped root+client from 0.1.0). Rain + creaks now cover menu AND game
  (App `ambient = atMenu || inGame`). **Real bug found & fixed:** on a fresh load the
  first gesture's `unlockAudio()` priming raced the menu rain — `startLoop` saw the
  element playing (muted prime) and skipped, then the prime paused it; `unlockAudio()`
  now returns a settle-promise and App flips `audioUnlocked` only after it resolves.
  Lobby waiting reskin (partner-detective text, `CASE Nº` via CSS `::before` — e2e
  still parses the raw code from textContent). Verified: new `.shots/menu-test.mjs`
  (**32 checks**, full cycle incl. reveal→menu restart) + 2.4a + 2.4b + timer-expiry +
  standalone server tests all green; `.shots/menu-{1-main,2-casefiles}.png`.
- **2.4b audio polish (balance + consistency).** Three follow-up fixes: (1) **rain
  lowered 0.12 → 0.04** — near-subliminal so it can't grate over a long session; (2)
  **notebook swish 0.25 → 0.40 and now on EVERY interaction** — open, each tab switch,
  and close (was open-only); (3) **UI click made consistent across ALL buttons** via a
  single delegated **capture-phase** listener in `App` (replacing the per-`ActionBar`
  call, vol 0.30 → 0.35). Capture matters: the modal wrappers' `e.stopPropagation()`
  (via React) also stops the native event, so a bubble-phase listener silently missed
  buttons INSIDE `SuspectModal` / `AccusationModal` — a real "click on some buttons but
  not others" bug, now fixed. Notebook buttons opt out with `data-sound="off"` and play
  the swish instead. Verified: `.shots/audio-2.4b-test.mjs` extended to **32 checks**
  (incl. an in-modal suspect-card click + tab-switch swishes) — all green; 2.4a suite +
  prod build clean. (Learned along the way: programmatic `element.click()` doesn't
  trigger the delegated listener in Chrome under these modals — e2e must use real clicks.)
- **2.4b — Ambient + UI + dramatic audio.** Added 7 CC0 clips to `sound.js` (same
  preload/volume/mute pattern as 2.4a): a quiet looping **rain bed**, **random door/floor
  creaks** on a **30–90s** self-rescheduling timer (picks one, only during the `playing`
  phase), a **UI button click**, a **notebook** swish, and the **accusation-lock-in** +
  **reveal** dramatic stings. Rain lifecycle in `App.jsx`: starts with gameplay, stops at
  the reveal / on return to lobby, **resumes on unmute** (effect keyed on `inGame` +
  `soundOn`). Everything is mute-aware (routes through the same `fire`/`startLoop`
  guards). Extended the dev-only `window.__wrAudio` handle with a `fire.*` map so e2e can
  trigger the creaks/stings deterministically. Verified by **`.shots/audio-2.4b-test.mjs`**
  (2-tab: rain + clicks + notebook exercised for real, **reveal via the real dev-mode
  soft-cap force-resolve**, creaks/lock-in via the `fire.*` handle); 2.4a suite +
  standalone server tests still green. ⚠️ `rain_loop.mp3` is **~19 MB** — flagged in
  `CREDITS.md` for re-encoding before launch. *Deferred* (intentionally): wind + thunder
  (storm bed is rain-only), distant footsteps, whispers, modal open/close.
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
- **Dual-window accusation** — defaults: **20-min soft cap · 5-min accuse gate ·
  3-min final window** (Dev Mode: 60s / 20s / 30s). *(Note: earlier docs said 3-min
  gate / 2-min window — the real values in `shared/constants.js` are 5-min / 3-min.)*
- **Room settings are HOST-CHOSEN (2.8).** The lobby's create form dials the game in
  Among Us style: time limit **Off / 15 / 20 / 30 / 45 min**, accuse gate, rival
  window, hotspot markers, sprint, rival-progress visibility. Shape + whitelist live
  in `shared/constants.js` (`SETTING_OPTIONS` / `DEFAULT_SETTINGS` / `DEV_SETTINGS` /
  `sanitizeSettings`); `room:create` had NO server-side validation, so untrusted
  settings MUST go through `sanitizeSettings` — never trust the panel.
  `WHISPERS_FAST_TIMERS` still overrides everything (the test suite depends on it),
  and Dev Mode is now just the `DEV_SETTINGS` preset.
  ⚠️ **`softTimer: null` (Timer: Off) is load-bearing in two places that silently
  invert the feature if unguarded**, because `null * 1000 === 0`:
  `scheduleForceResolve()` would fire on the next tick (revealing the solution the
  moment the second player joins), and `buildView().accusation.softMs` would freeze
  the client clock at 0:00. Both are guarded with `== null`; `server/test/timerOff.js`
  is the regression. Timer: Off still ENDS — the first lock-in arms the rival window.
- **"Rival progress: Hidden" is enforced in `views.js`**, not in CSS. Shipping the
  number and styling it away would be a two-click devtools cheat.
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
  the ONLY place sounds are defined/played. Footsteps are wired in `BoardCanvas`;
  everything else (searching / clue / nothing / tick burst, and 2.4b's rain lifecycle,
  creak scheduler, notebook swish, accusation-lock-in, reveal) in `App`. Global mute is
  the menu toggle, persisted in `localStorage` (`wr.soundOn`); muting stops all playing
  sound (incl. the rain bed) and unmuting **resumes the rain**. Nothing plays until
  `unlockAudio()` runs on the first user gesture. Dev-only `window.__wrAudio` handle
  mirrors `window.__wrChar` for e2e (also exposes a `fire.*` map for triggering one-shots).
- **UI click (2.4b):** a SINGLE delegated **capture-phase** click listener in `App`
  (`document.addEventListener("click", …, true)`) plays `playButtonClick()` for every
  `<button>` — so no button is ever missed. **Capture is required**: modal wrappers call
  `e.stopPropagation()` (backdrop guard), which via React also stops the native event, so
  a bubble-phase listener would silently miss in-modal buttons. Buttons that own another
  sound opt out with `data-sound="off"` (the notebook buttons → notebook swish). Disabled
  buttons don't dispatch clicks, and canvas hotspot examination isn't a `<button>`.
- **Rain bed (2.4b):** a single **near-subliminal** loop (vol **0.04**) under the whole
  game — App owns its lifecycle (start on gameplay, stop at reveal / lobby, resume on
  unmute). It MUST stay well below all gameplay-critical sounds; don't raise it.
- **Notebook swish (2.4b):** `playNotebookOpen()` fires on EVERY notebook interaction —
  open, each tab switch (Suspects/Weapons/Rooms), and close (vol **0.40**).
- **Random creaks (2.4b):** a 30–90s self-rescheduling timer plays EITHER a door OR a
  floor creak (never both), only during the `playing` phase; each tab runs its own
  scheduler (players hear their own ambient creaks — this is not a leak).
- **Clues state what the KILLER was; the CARDS say who that rules out (2.8).** A clue
  that reads "the killer was left-handed — Crane and Frost are right-handed" is an
  answer key, not a clue: the player reads a name and crosses it off. Clues now
  describe the evidence only ("the knot was pulled hard to the left"), and the suspect
  dossier carries `handedness` and a practical `note` so the player does the crossing
  off. `clue.eliminates` stays the ONLY machine-checkable truth — any dossier detail a
  clue leans on MUST also appear in that clue's `eliminates`, or solvability stops
  meaning what `validateCase()` claims. This reverses the earlier "bios are flavour
  only" rule on purpose; flavour-only bios left the cards with nothing to say.
- **The culprit's CORE answers must be breakable (2.8).** The clue-to-confession loop
  is: find the mud → ask "did you step outside?" → he says no → confront him with the
  mud → the story collapses. That only works if the lie sits on a question the clue
  actually points at. Vale's core lies were flat strings with no `brokenBy`, so the
  evidence pointed at answers nothing could test. ⚠️ At least TWO innocents must also
  have breakable stories (s1, s2 do) — if only the culprit's answers break, "who is
  lying" is the whole puzzle. `server/test/interrogation.js` [6b] pins the loop.
- **The briefing does NOT burn the game clock (2.8).** `startedAt` is still set on
  join, but play only BEGINS once both detectives send **`case:ready`** (dismissing
  the briefing), at which point the origin moves to now and the soft cap is re-armed.
  Before this the cap ran behind the story, and in Dev Mode — a 60s cap against a 60s
  briefing — the game reliably resolved itself mid-sentence and showed "No one cracked
  the case". ⚠️ A client that SKIPS the briefing must ack immediately (App does this on
  `game:start` for `?menu=skip`), or its partner waits on an ack that never comes. The
  design is additive on purpose: a socket that never acks behaves exactly as before,
  which is why every raw-socket server test still passes untouched.
  `server/test/briefingClock.js` is the regression.
- **The case briefing is a cinematic, not a dialog (2.8).** Entering a game opens on
  a **black** screen and TYPES the story out — victim, opening, backstory, then the
  six suspects one at a time — over the existing rain bed (App's `ambient` already
  covers the `playing` status, so the storm is under it without a new asset). The
  reveal is driven THROUGH `CaseBriefingBody` via its `reveal` prop rather than by
  re-implementing the layout, so the cinematic and the in-game **Scenario tab** render
  the same markup and cannot drift. Skippable by any key or click, and
  `prefers-reduced-motion` renders it complete. The screen is top-anchored, not
  centred — centring re-centres the block on every new line, so the story visibly
  jumps upward as it types. `?menu=skip` still bypasses the whole thing.
- **The manor map shows YOU, not your room (2.8).** `drawMiniMap` draws every room
  identically and puts a single pulsing dot at the detective's actual feet, so it is
  correct in the corridor and between rooms. It originally highlighted the current
  room, which meant it kept naming the room you had just walked out of. The live
  position comes from `client/src/game/playerPos.js` — a module store written once
  per frame by `BoardCanvas` and read by `MapOverlay`'s own rAF while it is open.
  ⚠️ Do NOT read `window.__wrChar` for this: that handle is stripped from production
  builds, so it would work in dev and break for real players. And do not route the
  position through React state — it changes every frame.
- **Main menu (2.7):** the app opens on a cinematic menu (`phase` state in App) BEFORE
  the lobby; `?menu=skip` (used by every e2e suite) starts on the lobby. The idle
  scene engine lives in `client/src/game/menuScene.js` (ONE rAF, zero timers,
  `MENU_GHOSTS_ENABLED` kill-switch, dev handle `window.__wrMenu`); it renders through
  **`MenuBackdrop.jsx`, which App mounts ONCE in the shared `.pre-game` wrapper over
  BOTH menu and lobby** — never remount it per screen (same tree position = the scene
  never resets; it unmounts only when a game starts / the reveal shows). **Rain** runs
  on ALL pre-game screens AND in-game via App's `ambient` flag (only the reveal is
  storm-free); **random creaks are `inGame`-only** (never on menu/lobby — and no button
  triggers a creak). Menu↔lobby transitions are content-only fades — **no cuts to black**.
  Lobby entry buttons are `.mm-btn` case-file tabs whose icons are CSS
  `content: attr(data-icon)` — their **textContent must stay exactly** "Create Room" /
  "Join with Code" (e2e exact-matches). `wr.devModeDefault` (localStorage, set from
  the Detective's Desk) only pre-checks the lobby's Dev Mode checkbox — the checkbox
  stays the per-room source of truth.
- **Modals** close with **Esc** (and their buttons). **Enter** also closes the
  Examine and Suspect modals, but is deliberately inert on the **Accusation**
  modal — locking in is irreversible, so a stray Return must never submit. Every
  modal blurs the trigger button on mount; otherwise the still-focused ACCUSE /
  QUESTION pill re-activates on Enter and the modal instantly re-opens.
- **Leaving a room is a server intent, not a client state reset.** Exit Game /
  Play Again / Main Menu all send **`room:leave`**; the server drops the player,
  `socket.leave()`s the code, tells the opponent (`peer:status {left:true}`) and
  **reaps the room once empty**. Creating/joining also detaches from any previous
  room, so one socket never holds two. App additionally ignores a `game:reveal`
  that arrives when it is no longer in a game (`inGameRef`) — an abandoned room
  can still resolve on its own soft cap and must never hijack the screen.
- **Forfeiting is never a win.** `resolve()` picks winners only among players who
  actually submitted an accusation, so a double forfeit yields `winners: []` and
  the reveal reads "No one cracked the case." (It used to take the max over
  everyone, so both forfeiters tied at 0 and it announced a draw.)
- **Action lockout after lock-in — but you can still WALK (2.8).** Once a player locks
  in, the server rejects examine/question/confront and the client disables every
  action pill — but movement stays live, so a locked-in detective can pace the manor
  while their rival finishes instead of sitting frozen. `setRegion` is deliberately
  NOT gated on `p.accusation`; roaming leaks nothing (room/inCorridor are private and
  the movement chat line is vague on purpose). `server/test/lockout.js` asserts both
  halves.
- **Hotspot→clue mapping is never sent** to a client until that exact spot is examined.
- **Interrogation is PER-SUSPECT** (`shared/suspectQuestions.js`): 12 core questions
  everyone answers + 15 written for each character = 102, and `validateCase()` now
  requires each suspect to answer only ITS OWN set (the old cross-product rule
  would have demanded ~600 answers for a pool this size). Question TEXT is shared
  because the client renders it; ANSWERS stay in the case JSON and arrive one
  branch at a time. **`QUESTION_CAP` (4) applies to core questions only —
  clue-unlocked ones are FREE**, so investigating buys interrogation leverage.
  A `requiresClue` question is filtered client-side AND **re-checked in `tryAsk`**;
  the client list is advisory and must never be trustable. Suspects can **lie**:
  an answer may be `{base, afterConfront, brokenBy}` (a plain string is still
  valid), and once the player confronts them with `brokenBy` the question becomes
  re-askable exactly once, for free — otherwise anyone who asked before finding
  the evidence could never hear the story collapse.
- **Furniture has ONE source of truth: `shared/roomObjects.js`.** Each object is
  `{id, name?, kind, x, y, w, h, solid, searchable}` in room-relative px, driving
  all three consumers — collision (`isWalkable` subtracts `solid` rects), hotspots
  (`roomHotspots.js` DERIVES `ROOM_HOTSPOTS` from `searchable`), and rendering
  (`drawBoard`'s `drawFromObjects`). The rect that is drawn IS the rect that
  blocks. These used to be two hand-synced lists that had already drifted (the
  Study advertised a fireplace hotspot where a floor lamp was drawn). **The 24
  searchable ids and their rooms are load-bearing** — `fallbackCase.json` places
  clues by hotspot id and `validateCase()` cross-checks id→room. Positions may
  change freely; ids and rooms may not.
- **ROOM LAYOUT RULE (a first pass got this wrong and trapped the player inside a
  desk):** keep the room **centre** (192,126 room-relative) clear — that is the
  spawn point — and keep the **door column** (x 148..236) clear from the centre
  out to the door edge: the BOTTOM wall for row-0 rooms (study/dining/lounge),
  the TOP wall for row-1 (library/kitchen/conservatory). Pieces hanging on a wall
  or ceiling (paintings, knife rack, chandelier, glazing) are `solid: false` —
  above/behind the floor plane, so examinable but never an obstacle.
  `server/test/movement.js` **[5] reachability · [6] doorway · [7] spawn ·
  [8] flood-fill connectivity · [9] centre-walkable** enforce all of it. [8]
  matters most: furniture can carve an isolated island of floor that passes both
  [5] and [6] while stranding a clue.
- **The static board is baked once** (`client/src/game/boardLayers.js`). Backdrop,
  corridor, brick, floors, furniture, doors, lighting, vignette and labels paint
  into an offscreen canvas and are blitted; only firelight flicker and the
  player-specific room highlights are per-frame. **Never invalidate from the game
  loop** — `window.__wrBoard.bakes` must stay at 1. This is what makes the detail
  affordable (the old renderer redrew ~168 strokes and allocated 5 gradients every
  frame). Lighting is DERIVED from `ROOM_OBJECTS` kinds (`lamp`/`fireplace`/
  `stove`/`window`) and **clipped per room** — unclipped, glow punched through
  walls onto the backdrop. The wall band is **cosmetic overdraw only**; making it
  solid would desync the art from `roomInterior()`.

## Testing Gotchas (learned the hard way)

- **Always restart the server after touching `server/` or the case JSON.** Node does
  not hot-reload. A stale process cost two "failing" test runs during 2.8 — the same
  zombie-server trap that once faked a 0:00 bug. `npm run dev` frees the ports first;
  a hand-started `node index.js` does not.
- **`overhaul-test.mjs` must NOT use Dev Mode.** It walks six rooms, waits 6s on the
  notebook, injects 100 messages and runs a full accusation — well past Dev Mode's 60s
  soft cap, at which point the game force-resolved and the reveal replaced the HUD, so
  every later section was querying an empty document with no visible cause. It now
  creates a **Timer: Off** room via the settings panel.
- **Hotspot centres are inside solid furniture and are unreachable by definition.**
  Reach is measured to the NEAREST POINT of the object's rect, so e2e must walk to a
  STANDING SPOT beside the piece. `searching-test.mjs` used room-centre fractions from
  before furniture was solid — 50px from the nearest hotspot against a 26px radius —
  and failed on a stale coordinate rather than on anything it tested.
- **Use the sidestepping walker.** The plain greedy `moveTo` pins itself on a desk
  corner forever; `hotspot-test.mjs` has the version that slides along the axis it is
  not trying to close.
- **`contain: size` sizes an element as if it were empty.** Fine for the fixed-height
  activity panel, wrong for anything content-sized (it collapsed `.ts-panel` to 25px
  of padding). Use `contain: layout` + `max-height` there.
- **Stale assertions found in 2.8:** `.act-btn === 4` (there are 3, and there has
  never been an EXAMINE pill — which also meant overhaul-test's "gather 2 clues" step
  gathered none), `menu-help === 4` (5 since 2.3a), and `nb.tabs === 3` (2 since the
  rail took the suspects). Confirm a suite is green BEFORE using it as a baseline.
- **Still broken from before 2.8, untouched:** `e2e.mjs` + `urgency-shot.mjs` query
  `.window-banner` (removed), `accuse-devmode.mjs` queries `.dev-badge` (removed), and
  `e2e.mjs` + `move-test.mjs` query `.hud-room-text` (never existed — it is `.hp-room`).

## File Structure Quick Reference

```
shared/                 # SINGLE SOURCE OF TRUTH (imported by client AND server)
  mapData.js            # rooms, connection graph, walkable geometry, collision
  constants.js          # timers, clue distribution, question cap, move speed
  caseSchema.js         # case JSON shape + solvability + hotspot validator
  roomHotspots.js       # the 4 hotspots per room (24 total) — positions + ids
  suspectQuestions.js   # 102 questions: 12 core + 15 per suspect, some clue-gated
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
  App.jsx               # phases (menu→lobby→playing→reveal), event wiring, searching SM
  net/socket.js         # promise-based intent senders (the `net` object)
  game/                 # BoardCanvas.jsx (rAF loop, WASD/E/click), Character.js
                        #   (feet-based collision, sprint), drawBoard.js (board +
                        #   drawHotspots + drawSearching), sprites.js, sound.js,
                        #   menuScene.js (2.7 idle-mansion engine + ghost AI)
  components/           # PlayerHud, TimerBar, ClueTracker, ActionBar, ActivityLog,
                        #   GameMenu, DeductionNotebook, SuspectModal, AccusationModal,
                        #   ExamineModal, RevealScreen, Lobby, MainMenu, MenuBackdrop
                        #   (shared pre-game scene), DeskPanel, CaseFilesPanel
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
  keys, searching animation, cute bubble, **audio 2.4a + 2.4b**, and the **cinematic
  main menu (2.7)** all ✅ (a few ambient/UI clips deferred); **Phase 2.5 (speech
  bubbles + idle animations) is next**.
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
  dev-only `window.__wrChar` handle for precise movement, `window.__wrAudio.state()`
  for audio assertions, and `window.__wrMenu.state()` for the main-menu ghosts;
  reduced-motion skips the 2.5s search). **All suites load `?menu=skip`** to start on
  the lobby; the menu itself is covered by `.shots/menu-test.mjs` (32 checks, run
  against a normal Dev-Mode `npm run dev`). Run scripts **from the repo root** (some
  save screenshots to `.shots/…` relative paths). Audio suite:
  `.shots/audio-test.mjs` (launch Chrome with `--autoplay-policy=no-user-gesture-required`).
  **Accusation-timing suite (all against a normal Dev-Mode `npm run dev`):**
  `.shots/timer-expiry-test.mjs` (S1: nobody accuses → soft-cap double forfeit) and
  `.shots/accuse-timing-e2e.mjs` (S8: window auto-forfeit · S9: both accuse → immediate
  reveal). **Furniture collision:** `.shots/study-collision-test.mjs` (solid desk
  blocks · lounge sofa blocks · a solid piece is still examinable from beside it ·
  saves a full-board shot). **Room lifecycle + modal keys:** `.shots/room-lifecycle-test.mjs`
  (Exit Game detaches server-side · no stale-reveal hijack · opponent notified ·
  rooms reaped · forfeit ≠ win · Esc/Enter modal contract).
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
- ✅ Rain bed loop (`ambient/rain_loop.mp3`, vol **0.04**) — `playRainLoop` / `stopRainLoop`
- ✅ Random door creak (`ambient/door_creak.mp3`) — `playDoorCreak` (30–90s scheduler)
- ✅ Random floor creak (`ambient/floor_creak.mp3`) — `playFloorCreak` (30–90s scheduler)

**UI**
- ✅ Button click (`ui/button_click.mp3`) — `playButtonClick` (primary action pills)
- ✅ Notebook swish (`ui/notebook_open.mp3`) — `playNotebookOpen` (open, each tab switch, and close)

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
