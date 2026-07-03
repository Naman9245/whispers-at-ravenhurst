# Roadmap — Whispers at Ravenhurst

> **Last updated:** 2026-07-02

Progress tracker. **Phase 1 (vertical slice) is complete**; **Phase 2 (polish) is
mostly complete** — audio **Pass 1 (2.4a) and Pass 2 (2.4b) are both done** (a few
ambient/UI clips deferred to a future pass — see 2.4). Phases 3–4 are planned. Session
context lives in **[CLAUDE.md](CLAUDE.md)**.

---

## Status Legend

| Marker | Meaning |
|--------|---------|
| ✅ | Done |
| 🟡 | Partial |
| ⬜ | Stub |
| ⏳ | Deferred |
| 🔜 | Planned |

---

## Phase 1 — Vertical Slice · **COMPLETE** ✅

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Project scaffolding (client + server + shared) | ✅ | `npm run dev` runs both; **frees dev ports first (kills stale zombie server/client, logs it)** |
| 2 | Lobby — create/join, room codes | ✅ | 5-char unambiguous codes, auto-start on 2 players |
| 3 | Mansion board render (canvas) | ✅ | reconciled to shared map data |
| 4 | Sprites + free-roam movement | ✅ | WASD / arrow keys with collision (no click-to-move) |
| 5 | WebSocket clue-count sync + ambient chat | ✅ | real per-player counts; vague location-free chat |
| 6 | AI case generator + validator | ✅ | fallback case + validator complete; **live API deferred (see 2.1 / Phase 3)** |
| 7 | Investigation mechanic | ✅ | (later replaced by the hotspot system, 2.2) |
| 8 | Suspect questioning | ✅ | dialogue trees, 3-question cap, evidence confront |
| 9 | Notebook UI | ✅ | Suspects/Weapons/Rooms tabs, 3-state marks, evidence list |
| 10 | Accusation system with dual-window timers | ✅ | base + reasoning + speed scoring; **all 3 timing paths verified end-to-end in-browser** — soft-cap force-resolve (`.shots/timer-expiry-test.mjs`) + window auto-forfeit (S8) + both-accuse immediate reveal (S9) (`.shots/accuse-timing-e2e.mjs`) |
| 11 | Anti-cheat server-authoritative | ✅ | single `buildView` serializer, test-covered |
| 12 | Disconnect handling | 🟡 | detected + `peer:status` + 30s cleanup; **token-based rejoin → Phase 4** |

---

## Phase 2 — Polish & Immersion · **MOSTLY COMPLETE** 🟡

### 2.0 — Minimalist fullscreen UI restructure ✅
Slim ~68px HUD (player · timer · clue bars · 📜/📓/☰ tools), compact pill actions,
the mansion board promoted to the hero (~85% of the viewport), and the chat log +
notebook moved behind slide-in panels (Activity from the left — hard size-capped with
`contain: layout size`; Notebook from the right) plus a Menu (sound / how-to-play / exit).

### 2.0.1 — Critical game-logic fixes ✅
Post-lock-in **action lockout** (server rejects move/examine/question after a player
locks in; client disables all actions + freezes input). LOCK IN flow verified
end-to-end; room-entry, free 4-directional movement, and wall-collision hardened and
covered by tests.

### 2.0.2 — Timer urgency redesign ✅
Production **20-min soft cap · 5-min accuse gate · 3-min final window** (Dev Mode
60s/20s/30s). Unified urgency: calm/green the whole game → a **3-second tick burst at
the 1:00 mark** → **visual-only** urgency (red timer + red edge vignette + red ACCUSE)
for the final minute. The intrusive "ACCUSE NOW or forfeit" banner was removed.

### 2.0.3 — Documentation ✅
README · DEVLOG · ARCHITECTURE · ROADMAP refreshed, and **CLAUDE.md** added for
session continuity.

### 2.1 — Live `claude-opus-4-8` API integration ⏳ *(deferred — awaiting credits)*
Pipeline + `validateCase()` + 3-retry/fallback are ready; the call is the marked
slot-in in `server/ai/generateCase.js`. Tracked as the first actionable item of
**Phase 3** once API credits are available.

### 2.2 — Hotspot Exploration System ✅ *(FLAGSHIP)*
Active, spatial searching instead of one button. **4 hotspots per room** (24 total in
`shared/roomHotspots.js`); walk up + press **E** (or proximity-gated click) to examine
one → the player's clue there, a red herring, or "Nothing of interest here." (one
outcome per hotspot per player, discovered privately). The old INVESTIGATE button was
removed; the notebook shows "Room — Hotspot name" and per-room `n/4 → ✓ Searched`.
**Anti-cheat:** the hotspot→clue map never leaves the server until that spot is examined
(`tryExamine`, event `hotspot:examine`). Tests: new `server/test/hotspots.js` + updated
`lobbyFlow`/`lockout`/`caseValidation`.

### 2.3a — Modal keys + sprint ✅
Examine/result modals close with **Enter or Esc** (Close button still works; input
resumes with no canvas re-click). **Shift** = 2× movement, all 8 directions, client-side
only (server clamps to walkable areas); Shift alone idles; gated during modals/lockout.

### 2.3b — Searching animation ✅
Pressing **E** starts a **2.5s "searching" state** (input locked) before the result
modal; **no skip** by design; `prefers-reduced-motion` pops instantly; 5s safety reset.
No server change — opponent still only sees "examining something…" on commit. Audio
hooks were silent stubs here; **now filled in 2.4a** (looping searching sfx + result dings).

### 2.3c — Cute white cloud speech bubble ✅
Restyled the searching bubble into a soft white comic speech-cloud (warm-white fill,
navy border, drop shadow, downward tail, bouncing charcoal dots, gentle bob, puff
in/out). Canvas-rendered (`drawSearching`); logic unchanged.

### 2.4 — Audio Polish ✅ *(Pass 1 + Pass 2 done)*

**Pass 1 — Critical sounds ✅** *(2.4a)*
`client/src/game/sound.js` rewritten as a real HTML5-`<audio>` manager (six preloaded
CC0 clips, tunable per-sound volumes, autoplay-unlock on first gesture, global mute).
Wired: **walking + sprinting footsteps** (movement-state transitions in `BoardCanvas`,
no per-frame restarts), the **2.5s searching loop**, the **clue-found ding** /
**nothing-found whoosh**, and the one-shot **~3s tick burst** at the 1:00 mark (replaces
the old synthesized tick). Menu **Sound: ON/OFF** persists in `localStorage`. Verified by
`.shots/audio-test.mjs` (30 checks, 2-tab) + the searching/hotspot suites still green;
prod build strips the dev handle. Credits in `client/public/sounds/CREDITS.md`.

**Pass 2 — Ambient + UI + dramatic ✅** *(2.4b, + balance/consistency polish)*
Seven new CC0 clips added to `sound.js` (same preload/volume/mute pattern): a
**near-subliminal rain bed** (vol **0.04**, well below all gameplay sounds), **random
door/floor creaks** on a 30–90s self-rescheduling timer (picks one, only during the
playing phase), a **UI button click** (vol 0.35), a **notebook swish** (vol 0.40, on
open + every tab switch + close), and the **accusation-lock-in** + **reveal** dramatic
stings. Rain lifecycle: starts with gameplay, stops at the reveal / on return to lobby,
resumes on unmute. The UI click is a **single delegated capture-phase listener** in `App`
over every `<button>` (capture is required — modal wrappers' `e.stopPropagation()` would
otherwise hide in-modal buttons from a bubble listener; that was a real "some buttons
click, others don't" bug); notebook buttons opt out via `data-sound="off"`. Everything is
mute-aware and dev-handle-observable. Verified by `.shots/audio-2.4b-test.mjs` (**32
checks**, 2-tab: rain + clicks + notebook + an in-modal button exercised for real, reveal
via the real dev-mode soft-cap force-resolve, creaks/lock-in via the dev `fire.*` handle)
with 2.4a + server suites still green.

*Deferred to a future polish pass (intentionally not added now):* wind + a thunder layer
(the storm bed is **rain-only** for now), distant footsteps, whispers, and the modal
open/close pair. Tracked in **[CLAUDE.md](CLAUDE.md) → Sound Assets TODO**.

### 2.5 — Speech bubbles + idle animations 🔜
Contextual bubbles above the character (`...` investigating, `!`/"Aha!" on a clue, `?`
questioning; auto-dismiss). Idle loops while standing still (Holmes: pipe/deerstalker;
Watson: pocket-watch/bowler).

### 2.6 — Optional flavor 🔜
- Scripted scare event at the 5-minute mark (lights flicker, scream, a new clue).
- Hostile suspects after their 3 questions are spent (deflect / refuse).

### 2.7 — Cinematic Main Menu ✅
A proper entry screen BEFORE the lobby (flow: **menu → lobby → game → reveal**; the
reveal's "Main Menu" button now returns to the menu, "Play Again" stays lobby-bound).
**Idle-mansion backdrop** (`client/src/game/menuScene.js`): reuses `drawBoard` +
`Character` + `pathBetween` for two translucent autonomous ghost detectives wandering
room→room (waypoint steering, 10px arrival radius, 2s stuck-guard, kill-switch
`MENU_GHOSTS_ENABLED`), slow canvas-level camera drift (1.06 overdraw + sin/cos),
random room-light pulses, and a ~250ms lightning flicker every 20–30s (visual-only —
no thunder asset yet). ONE rAF, zero timers → StrictMode-safe, leak-proof `stop()`.
**UI:** typewriter title (~0.8s), random tagline (5-pool), case-file-tab buttons with
paper-lift hover + notebook-swish, gold magnifier SVG cursor, Begin Investigation →
door creak + content fade → the EXISTING lobby. **Detective's Desk:** Sound (shared
state), Fullscreen (API + `fullscreenchange` sync), Dev Mode default (localStorage
`wr.devModeDefault` pre-checks the lobby checkbox — lobby stays per-room source of
truth). **Case Files:** fetches + renders `sounds/CREDITS.md` live (tiny md renderer),
builder credit, repo link, `v0.9.0` from package.json (bumped root+client). Rain/creak
ambience covers all pre-game screens + gameplay (App's `ambient`); fixed a real unlock
race (rain's first `startLoop` during unlock priming got paused by the prime —
`unlockAudio()` now resolves when priming settles). Lobby waiting reskin (text +
`CASE Nº` via CSS `::before`; e2e still reads the raw code). e2e: all 17 suites
migrated to `?menu=skip`; new **`.shots/menu-test.mjs`** — all green, plus
2.4a/2.4b/timer-expiry/server regressions.

**Continuity fix-up:** the idle scene was extracted into **`MenuBackdrop.jsx`**, which
App mounts ONCE in a shared `.pre-game` wrapper across **menu AND lobby** — the scene
(and the storm audio) carries through screen swaps with no remount/reset, unmounting
only when a game starts or the reveal shows. Begin Investigation's fade-to-black became
a ~300ms content-only fade; the lobby card glides in over the same scene. Lobby entry
buttons restyled as `.mm-btn` case-file tabs (icons via CSS `attr(data-icon)`, so
textContent stays exact for e2e; hover lift + notebook swish; create/join logic
untouched), and a themed **← Back** (`.mm-back`) returns lobby→menu (home mode only),
with the same style unifying the Desk/Case Files footers. `menu-test.mjs` → **41
checks** (continuity marker across round-trips, rain-through-lobby, back navigation,
backdrop-unmounts-in-game, fresh-scene-after-reveal).

---

## Phase 3 — Content Expansion · **FUTURE** 🔜
- 🔜 **Live `claude-opus-4-8` generation** — switch on when API credits are available
  (the integration point already exists; see 2.1).
- 🔜 Map 2: **Moonlight Hotel** (1920s art-deco).
- 🔜 Map 3: **Blackthorn Estate** (Gothic).
- 🔜 Random map selection per game.
- 🔜 **Multi-floor mansion expansion** *(locked in from user request)* — upper floor(s)
  via staircase connections (e.g. Library → Upstairs Hallway → Master Bedroom /
  Servants' Quarters / Attic) plus an optional basement (Wine Cellar, Crypt). More
  hotspots per floor, per-floor ambient sound (creaky upstairs vs damp basement), floor
  transition logic + camera switching, and a multi-floor-aware case generator.
  *Substantial — ~1–2 weeks of level design + UI on its own.*
- 🔜 Suspect portrait pools per map (Pixellab generation).
- 🔜 Hotspot system extended to all maps.

---

## Phase 4 — Launch · **FUTURE** 🔜
- 🔜 Token-based reconnect (completes Step 12 disconnect handling).
- 🔜 Meta-progression: stats, win rate, accuracy, titles.
- 🔜 Optional leaderboard.
- 🔜 Deployment (Vercel for the frontend, Railway/Render for the backend).
- 🔜 Demo video / GIF for the portfolio.
- 🔜 itch.io launch (optional).

---

> **Note:** Phase 2.4+ items are built in their own focused sessions. Audio **Pass 1
> (2.4a) and Pass 2 (2.4b) are complete**; a few ambient/UI clips (wind + thunder,
> distant footsteps, whispers, modal open/close) are **deferred to a later polish pass**.
> The next track is **2.5 (speech bubbles + idle animations)**.
