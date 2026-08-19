# Phase 2.8 — Game Modes, Camera & the New Layout

> **Status:** planning complete, implementation in progress on branch `phase-2.8`.
> **Written:** 2026-08-19
> Supersedes parts of the Phase 2 design, and folds in Phase 2.5.
> Read alongside [ROADMAP.md](../ROADMAP.md) and [CLAUDE.md](../CLAUDE.md).

---

## 1. Why this phase exists

Three complaints drove it:

1. **The timer is forced on everyone.** A deduction game punishes you for reading
   carefully. A player who is genuinely solving the case should not be guillotined
   at 20:00.
2. **There is no story on screen.** The case *has* a narrative — it is simply never
   rendered. Players start with no idea who died or why.
3. **The board reads as a board, not a place.** The whole mansion is visible at once,
   zoomed out. No camera, no map, no sense of being somewhere.

Everything below follows from those three.

---

## 2. Decisions locked

| # | Decision | Notes |
|---|---|---|
| D1 | Timer stays, but becomes **host-configurable** in the lobby | Among Us-style settings panel; Timer:Off is a valid choice |
| D2 | Both players lock in, **then** the truth is revealed | Unchanged from today. What changes: you can **walk while waiting** |
| D3 | Camera **zooms in and follows** the player | Replaces the fixed whole-board view |
| D4 | The map is **hidden** — opens as a compact overlay | `M` or the top-bar button; not permanent screen real estate |
| D5 | New in-game layout | Race top bar · game view · scenario strip · suspect rail |
| D6 | Suspects become **flip cards** with bio detail | Right rail; replaces the notebook's Suspects tab |
| D7 | The **base scenario** is surfaced at game start and re-openable | Data already exists server-side |
| D8 | Configurable **suspect count** is deferred | Blocked — see §6 |
| D9 | **Phase 2.5 is in scope** — speech bubbles + procedural idle | The camera pass touches the same code anyway |

### Resolved along the way

- **An endgame race was considered and rejected.** An earlier draft had the first
  *correct* accusation end the game immediately, with a wrong one eliminating the
  player. Dropped: with one answer each and a reveal once both are in, no penalty rule
  is needed at all, and the whole "does guessing beat deducing" balance problem
  disappears. The one real gap it left — a player who locks in early then sits frozen
  for ten minutes — is fixed by letting them roam instead.
- **Rival progress is visible by default**, with a lobby toggle to hide it. When
  hidden it is withheld **server-side** in `buildView()`, never with CSS — shipping
  the number and hiding it in the DOM would be a two-click cheat.
- **No new sprite art is available**, so idle animation is procedural and reuses the
  existing 4-frame breathing idle.

---

## 3. What already exists (do not rebuild)

Checked against the code, not memory:

- `narrative.opening`, `victim_name`, `victim_backstory` and
  `ending_monologue_template` are all present in `server/ai/fallbackCase.json`.
- `server/views.js` already ships `victimName` + `opening` to the client inside
  `caseInfo`. **Nothing in the client renders them.** The story is written and
  transmitted — only the component is missing.
- `buildView()` already ships `opponent.clueCount`, `opponent.lockedIn` and
  `opponent.connected`. The new race top bar needs no new server data.
- The whole endgame already works: `tryLock()` validates, the first lock-in opens the
  opponent's window, two lock-ins resolve, and `resolve()` scores. **Pass B deletes
  one guard rather than adding a rule.**
- The static board is baked once into an offscreen canvas
  (`client/src/game/boardLayers.js`). The map overlay is one `drawImage` of that same
  canvas, scaled down.
- `client/src/game/menuScene.js` already draws through a `setTransform` camera, which
  proves the whole render stack is transform-safe.
- Character sprites already frame-cycle: 4-frame breathing idle and 6-frame walk, per
  direction, for both detectives. `assets/{holmes,watson}/rotations/*.png` exist for
  all 8 directions and are never loaded — free top-bar avatars.

---

## 4. Invariants that must survive this phase

Breaking any of these is a regression, not a trade-off.

1. **Server authority.** Clients send intents. The solution never reaches a client
   before the reveal.
2. **One privacy boundary.** `buildView()` in `server/views.js` stays the only
   serializer. The opponent stays reduced to `{name, character, clueCount, lockedIn,
   connected}` — never position, clues, or notebook. The map overlay draws **only your
   own dot**.
3. **The board bakes once.** `window.__wrBoard.bakes` must stay at `1`. The camera is
   a per-frame *transform*; the 2× bake is still a single bake.
4. **Hotspot ids and their rooms are load-bearing.** `fallbackCase.json` places clues
   by hotspot id and `validateCase()` cross-checks id→room.
5. **Lobby button text and the Dev Mode checkbox.** `.mm-btn` must keep `textContent`
   exactly `"Create Room"` / `"Join with Code"`, and `.lb-check input[type="checkbox"]`
   must stay the **only** `.lb-check` — twelve e2e suites click it.
6. **`?menu=skip`** must keep working; every e2e suite starts on the lobby with it.
   It now also skips the briefing screen.
7. **Enter stays inert on the Accusation modal.** Lock-in is irreversible.

---

## 5. The passes

Ordered so nothing is built twice: server work first (independent of layout), then the
renderer, then the shell, then the panels that fill it.

### Pass 0 — Commit the pending work ✅

Three finished fixes that were sitting uncommitted: hotspot markers now draw *after*
the occluder blit; the current-room teal wash is gone; sprint footsteps 0.25 → 0.42.

---

### Pass A — Lobby settings panel *(fixes the #1 complaint)*

| Setting | Values |
|---|---|
| Time limit | Off · 15 · 20 · 30 · 45 min |
| Accuse gate | 0 · 3 · 5 min |
| Opponent window | 2 · 3 · 5 min |
| Hotspot markers | On · Off — a real difficulty dial |
| Sprint | On · Off |
| Rival progress | Visible · Hidden |

`shared/constants.js` gains `SETTING_OPTIONS`, `DEFAULT_SETTINGS`, `DEV_SETTINGS` and
a whitelist-only `sanitizeSettings()` — mandatory, because `room:create` has no
server-side validation today and a crafted socket could send `accuseGate: -1`.
`GameRoom`'s constructor becomes `(code, devMode, settings)`, additively, so existing
tests keep working; `WHISPERS_FAST_TIMERS` still wins over everything.

**Two null traps, both load-bearing:**

- `scheduleForceResolve()` computes `Math.max(0, softTimer * 1000 - elapsed)`. With
  `softTimer: null` that is `0` → **every Timer:Off game reveals the solution on the
  next tick**. Needs an explicit `== null` guard.
- `buildView()` ships `softMs: softTimer * 1000` → `0`, and the client derives
  `gameEndAt = startedAt + softMs`, so the ACCUSE pill would read `(0:00)` forever.
  Fixed in `views.js`, `App.jsx` and `TimerBar.jsx` together; Timer:Off counts **up**
  under a `NO LIMIT` label.

Hotspot markers off still draws the in-reach "Press E" prompt — hiding both would make
examining undiscoverable rather than harder.

---

### Pass B — Walk while waiting for your rival

The only endgame change. Delete **one** guard — the `setRegion` lockout in
`server/game.js` — and drop `!youLocked` from the client's `inputEnabled`. Examine,
question and accuse stay blocked; every action pill stays disabled.

Movement post-lock is provably safe: `setRegion` only records `room`/`inCorridor`
(both private), and the chat line it emits is already deliberately vague.

The three remaining lockout messages get reworded from "no further moves" to the
waiting frame.

---

### Pass C — Camera zoom + follow, and the map overlay

The biggest renderer change since the bake.

A new `client/src/game/camera.js` (no React, no rAF) with exponential follow, clamping
to the board, and `toView` / `toWorld` projections. The canvas backing store stays
1472×860 — it becomes a *view*, not the board.

**The four real costs:**

1. **Click → world coordinates.** The click handler is the only canvas→board mapping
   in the client and must invert the camera, or clicking hotspots silently breaks.
2. **Bake at 2×**, by scaling the *bake context* so `paintStatic` and its ~600 lines of
   helpers keep drawing in world units unchanged. `drawOccluders` is the silent
   breaker: its **source** rect is in bake pixels while its **dest** is in world units,
   so it needs the scale applied to one and not the other.
3. **UI moves to screen space** — hotspot markers, prompts and speech bubbles draw
   after the transform is reset, or they balloon with the zoom. The examine glow ring
   stays in world space; it is a marker on the furniture.
4. **An explicit canvas clear.** There is none today — the implicit clear is the board
   blit. `menuScene.js` already does this correctly.

The map overlay is a ~470px centred panel: one scaled `drawImage` of the bake, a dim
wash, room outlines, your room highlighted. Toggled with `M` or Esc.

`ZOOM` ships as a tunable constant with a DEV-only `[` / `]` adjust — the right value
is settled by eye, not arithmetic.

---

### Pass C2 — Phase 2.5: bubbles + procedural idle

`drawSearching`'s cloud becomes a general `drawBubble`, and a tiny `bubbles.js` holds
one `{text, until}` with timestamp-only scheduling (no timers, per the house rule).
`"Aha!"` on a clue, `"Hmm…"` on an empty spot, `"?"` when questioning, `"!"` on
lock-in.

Idle motion is procedural: a breathing bob, a breathing shadow, and — the real win —
an **idle glance** after 8–14s of standing still, cycling the facing through its two
neighbours and back. That reuses the existing per-direction idle frames, so it needs
no new art.

---

### Pass D — Layout shell

```
┌─────────────────────────────────────────────────────┐
│  YOU ●●●●○○○    14:22 / STORM SEALED   ○○○ RIVAL  ⋮  │  top bar
├──────────────────────────────────────┬──────────────┤
│                                      │   SUSPECT    │
│         GAME VIEW  (hero)            │   CARD RAIL  │
│     camera follows · actions float   │   (scrolls)  │
├──────────────────────────────────────┤              │
│  Scenario · Questions · Log          │              │  tab strip
└──────────────────────────────────────┴──────────────┘
```

One grid, one 12px gutter. The rail's top edge aligning with the game view is
**structural** — same grid row — not a hand-tuned offset. One hero: the game view is
the only bright, large surface, and everything else shares a panel colour, border
weight and radius so it reads as chrome. Action pills float inside the hero.

The top bar becomes a race scoreboard: your pips on the left, the timer and its phase
label centred (`STORM SEALED` → `ACCUSE OPEN` → `FINAL WINDOW` → `NO LIMIT`), the
rival's pips and status on the right. That phase label is the first time the UI ever
explains why the ACCUSE button is greyed out.

**Keeping the existing class names and the 68px bar height turns "selector churn" into
zero churn** across the e2e suites. The notebook's suspect marks are lifted into `App`
in this pass, so the rail in Pass F is never built against dead state.

---

### Pass E — Case briefing + scenario strip

A briefing screen between the lobby and the board — victim, opening, backstory, cast,
and the settings this game was created with — with the same body re-openable from the
Scenario tab.

`?menu=skip` skips the briefing too (it already means "skip the ceremony"), so no
existing suite changes; `?menu=skip&briefing=1` opts the new one in.

**Accepted trade-off:** the server starts the clock on join, so it runs during the
briefing. Gating it on both players acking would need a new intent, a both-ready gate
and a stall path — a real protocol change for a cosmetic screen. Instead the briefing
shows the live clock, says so, and auto-dismisses at 45s.

---

### Pass F — Suspect flip cards

Rail cards that flip to a bio: age, height, build, occupation. All optional schema
fields, so existing cases keep validating.

**`arrival` is deliberately dropped.** Age, height, build and occupation are
categorically non-eliminating. "Time of arrival" is not: a card reading "arrived 9:15"
beside a clue reading "the culprit was in the library at 9:15" hands out a free
elimination that `validateCase()` cannot see, because it only reads `clue.eliminates`.

The rail replaces the notebook's Suspects tab — suspects already render in three
places, and a fourth would make it ambiguous which list is authoritative. Flipping
lives on its own corner affordance so clicking the card body still cycles the mark.

---

## 6. Deferred, with reasons

**Configurable suspect count** — blocked, not skipped. `SUSPECT_COUNT = 6` is not a
display number: `fallbackCase.json` is hand-authored for exactly those six people,
every clue's `eliminates` array names specific suspect ids, `validateCase()` proves
solvability against exactly six, and `shared/suspectQuestions.js` has fifteen
hand-written questions each for `s1`–`s6`. There is no seventh person to interrogate,
and removing suspects breaks the elimination maths that makes the case solvable.

This unlocks with **live case generation** (Phase 3 — the `claude-opus-4-8` slot in
`server/ai/generateCase.js`, deferred awaiting API credits). Then suspect count is just
a generation parameter.

Worth naming: in Among Us, impostor count matters because impostors are *players*.
Here suspects are NPCs, so the equivalent difficulty dial is **how much evidence you
get** — hotspot markers off, fewer clues. Those ship in Pass A.

**Question templating** — `shared/suspectQuestions.js` is static shared code, but the
case is meant to be generated. Core questions hardcode `"Lord Edmund"` and
`"Have you set foot in the library tonight?"`. The moment a new case or Map 2
(Moonlight Hotel) exists, every question is wrong. The fix — templated text
(`{victim}`, `{crimeRoom}`) filled from `narrative`, with per-suspect sets moving into
the case JSON — is small now and a painful migration later. **Do it before Map 2.**

---

## 7. Order of work

```
Pass 0   commit pending work        ✅ done
Pass A   lobby settings panel       server + lobby, no layout dependency
Pass B   walk while waiting         one guard deleted, two tests inverted
Pass C   camera + map overlay       riskiest; rewrites the rAF loop
Pass C2  bubbles + procedural idle  same files as C — done in the same sitting
Pass D   layout shell               needs C's hero box to be real
Pass E   case briefing              fills D's strip
Pass F   suspect flip cards         fills D's rail
```

A and B are server-side and independent of the visual work. C2 follows C immediately
because the camera has to change `drawSearching`'s signature anyway — generalising the
bubble at that moment is strictly less work than doing it twice.
