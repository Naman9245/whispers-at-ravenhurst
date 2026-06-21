# Development Log — Whispers at Ravenhurst

> **Last updated:** 2026-06-21

The story of how the game was built: the idea, the decisions that shaped it, the
"loopholes" a competitive deduction game has to close to stay fair, the build
phases in order, and what real playtesting surfaced.

---

## 1. Initial Concept & Ideation

The starting question was *"what's a portfolio game I can ship solo in about a
month that shows real engineering — networking, state management, anti-cheat —
not just CSS?"*

A few ideas were weighed:

- **A faithful digital board game** (turn-based Clue/Cluedo). Rejected: turns are
  easy to sync but kill tension, and "digitize a board game" reads as a tutorial.
- **A single-player murder mystery.** Rejected: no networking story to tell, and
  the hard/interesting problems (sync, fairness, anti-cheat) disappear.
- **A real-time, two-player deduction race** *(chosen)*. It keeps the satisfying
  Clue core — culprit / weapon / room — but reframes it as a **simultaneous race**
  where the interesting engineering lives: a server-authoritative model, a privacy
  boundary, and fair scoring.

Three constraints fixed the scope from day one:

1. **It must be fair.** If a player could see the opponent's position, clues, or
   the solution, the game is meaningless. Fairness had to be *structural*, not
   trusted.
2. **It must always be playable.** A recruiter should clone, run, and play a full
   mystery in minutes — no API key, no database, no setup.
3. **It must feel like a game, not a form.** Pixel-art mansion, animated sprites,
   real movement, a clock with teeth — not a stack of dropdowns.

Deduction won over the alternatives because it's the genre where *hidden
information* is the whole point — which makes the anti-cheat work meaningful
rather than ceremonial.

---

## 2. Key Design Decisions (with rationale)

| Decision | Why |
|----------|-----|
| **Server-authoritative architecture** | Anti-cheat from day one. Clients send *intents* (`region:enter`, `investigate`, `accuse:lock`); the server validates, mutates state, and pushes back a filtered view. The client is never trusted. |
| **Pre-generated dialogue trees** (vs live AI per question) | Sync, cost, and speed. A baked tree means instant, deterministic answers, no per-question latency or token spend, and identical behavior for both players. Live generation happens **once** at case start, not per interaction. |
| **Dual-window accusation** (vs first-to-click) | Fairness. A pure race punishes the player who happens to read a clue a second slower. Instead, the first lock-in opens a fixed **final window** so the opponent always gets a fair chance to respond. |
| **Fixed clue counts (3 shared / 4 private / 1 herring)** | Determinism. Fixed counts make the case **machine-verifiable** (the validator can prove solvability) and the progress tracker meaningful, instead of variable ranges that are hard to balance or test. |
| **Visual-novel-style canvas in the browser** (vs a game engine) | Scope. The board is a fixed six-room schematic with two moving sprites — a full engine (Phaser) would add a second framework next to React for little gain. Raw Canvas 2D keeps lobby, board, and notebook in one React tree with total control of the pixel look. |
| **Normalized clue denominator** (`n/7` for both) | Privacy. The opponent's count is reported against the same `7` regardless of herrings found, so the number leaks *progress* and nothing about *which* clues or how many herrings. |
| **Free-roam, simultaneous movement** (vs turn-based) | Modern feel. Each client runs its own render loop; only outcomes (clue counts, the verdict) are shared. The trade-off — strict per-instant privacy on the server — was worth the tension it buys. |
| **2 playable detectives, variable suspect cast** | Variety without scope blow-up. Two fixed protagonists (Holmes/Watson) keep the sprite work bounded, while AI-generated suspects/weapons/clues give every game a fresh mystery. |

A cross-cutting decision underpins several of the above: a **`/shared` package as the
single source of truth.** The map graph, rule constants, question pool, and case
schema are imported by *both* client and server via an `@shared` alias (the
client's `boardData.js` is a one-line re-export of `shared/mapData.js`). This makes
client/server disagreement about geometry or rules impossible by construction.

---

## 3. Loopholes Identified & Addressed

Building a *competitive* hidden-information game surfaced a series of ways a clever
or curious player could break it. Each was closed deliberately:

| Loophole | Fix |
|----------|-----|
| **Unfair clue distribution** — one player could be starved of evidence | A **shared + private** system: 3 shared clues (either can find) + 4 private per player, with the validator proving *each* player can solve from their own set. |
| **Lucky guessing** beating real deduction | A **reasoning bonus** — citing clues that genuinely support the solution scores points; a blind-but-correct guess scores less than a proven one. |
| **Console cheating** — reading game state in devtools | The **server holds the solution**; it is never serialized to a client until `game:reveal`. |
| **Sync issues / client drift** | **Server-authoritative** state — the server's `setTimeout`s and validations are the only authority; clients render from pushed views. |
| **Information leaks** in the network payload | A single **privacy filter** (`buildView` in `views.js`) is the *only* serializer; the opponent is reduced to `{ name, character, clueCount, lockedIn, connected }`. |
| **Repetition** — the same case every time | **AI case generation** (pipeline + validator complete) makes each game a fresh, solvable mystery. |
| **Player acting after lock-in** — moving/investigating to keep gathering an edge while the opponent's window runs | **Action-button disabling** + server rejection: once `p.accusation` is set, `setRegion` / `tryInvestigate` / `tryAsk` / `tryConfront` all return `{ ok:false, locked:true }`, and the client grays every action and freezes input. |

Each of these is asserted by the test suite — `server/test/lobbyFlow.js` (privacy),
`accusation.js` (scoring/forfeit), `caseValidation.js` (solvability), `movement.js`
(collision), and `lockout.js` (post-lock-in rejection).

---

## 4. Build Phases (chronological)

### Pre-production
- A written design doc fixing the rules, the privacy model, and the scoring formula.
- **Asset generation**: Holmes/Watson eight-direction sprite sets via **Pixellab.ai**;
  a concept mockup via **Gemini** (`reference/whispers-mockup.png`) to lock the look.

### Production — Phase 1 (vertical slice, 12 steps)
Built as a vertical slice: every system end-to-end, narrow but complete.

1. **Scaffolding** — client + server + shared packages; `npm run dev` runs both.
2. **Lobby & movement validation** — create/join by 5-char code, auto-start on two
   players, server-authoritative region tracking, privacy-filtered views.
3. **Board render** — the mansion drawn on canvas, reconciled to the shared map.
4. **Sprites & movement** — eight-direction Walking/Idle animations; evolved from
   click-to-move into full free-roam WASD/arrow walking with collision.
5. **Clue-count sync & ambient chat** — the shared tracker shows real per-player
   counts; move/investigate emit deliberately vague, location-free chat lines.
6. **Case generation + validator** — the solvability validator and a baked,
   validated fallback case wired into game start (live API call → Phase 2.1).
7. **Investigation** — reveal *all* of a player's clues for a room at once;
   per-player "already searched"; herrings shown but excluded from the count.
8. **Suspect questioning** — pooled questions, a 3-per-suspect cap, and evidence
   confrontation that unlocks behavioral tells; one branch served at a time.
9. **Notebook** — Suspects / Weapons / Rooms tabs with a 3-state local marking
   system and a persistent evidence list.
10. **Accusation endgame** — the gate, dual-window timers, base + reasoning + speed
    scoring, and a simultaneous reveal with a filled-in monologue.
11. **Anti-cheat hardening** — the privacy boundary audited and covered by tests.
12. **Disconnect handling** — detection + `peer:status` + 30-second cleanup
    (token-based rejoin still planned).

### Polish pass (post-vertical-slice)
- **Minimalist fullscreen UI restructure** — a slim cohesive HUD, compact pill
  actions, the board promoted to ~85% of the viewport, and the chat log + notebook
  moved behind slide-in panels.
- **Unified timer-urgency design** — calm green for the whole game, a single
  3-second tick burst at the 1:00 mark, then red timer + red edge vignette for the
  final minute (no banners, no continuous sound).
- **Post-lock-in action lockout** (server + client).
- **Suspect-question rewrite** — ten character-driven Victorian-detective questions
  with matching period-appropriate answers and tells.

### Notable bugs caught + fixed
- **Floating / one-directional sprite in rooms** — the standing spot sat jammed
  against a wall, so vertical travel was lopsided. *Fix:* centre the standing spot;
  now balanced travel on both axes, captured by `server/test/movement.js`.
- **Sprite clipping past walls near doors** — the collision doorway gap was wider
  than the *drawn* door. *Fix:* match `DOOR_HALF` to the visual door and drive the
  drawn door off the same constant so they can't drift.
- **Stale server after edits** — the server runs without `--watch` in some flows;
  shared-layer edits (e.g. the question pool) silently used old data until restart.
  *Lesson:* always restart the server after `/shared` changes; tests now catch drift.
- **Self-dependency regeneration noise** — the client lists the repo as a `file:..`
  dependency; reinstalls could churn. Pinned and documented.
- **Chat-log overflow** — the old always-on log could grow and crowd the board.
  *Fix:* replaced with a hard-capped slide-in **Activity** panel (`contain: layout
  size`, fixed box, inner scroll) that cannot grow regardless of message volume.
- **Room-entry glitches at doorways** — coarse navigation could leave a player stuck
  at a threshold. Verified every room is enterable via a closed-loop browser test;
  geometry confirmed sound.

---

## 5. Playtesting Discoveries

Full two-tab playthroughs (Puppeteer driving real Chrome, plus manual play)
confirmed the game works end-to-end — and surfaced issues a solo code read wouldn't:

- **UI clutter required multiple revisions.** The first HUD was three disconnected
  widgets and the board was too small. It took several passes to land on one
  cohesive ~68px HUD bar with the board as the clear hero at ~85% of the viewport.
- **The chat log needed strict containment.** Long clue text wrapped and the box
  grew. The fix wasn't styling alone — it became a separate slide-in panel with CSS
  containment, verified by injecting 100 messages and asserting the box never grows.
- **Movement bugs only surfaced via real play.** Unit tests proved the geometry, but
  driving an actual character through all six rooms exposed the threshold-stuck feel
  and confirmed the fixes.
- **Timer urgency was refined through iteration.** Early versions over-warned (a
  five-tier escalation and a big "ACCUSE NOW or forfeit" center banner that covered
  the board). It was deliberately *simplified* to a single principle: calm and
  silent until 1:00, then one 3-second tick burst, then red timer + red screen-edge
  vignette only — urgency without intrusion.

---

## 6. Phase 2 — Polish & Immersion

With the vertical slice solid, Phase 2 turned it from "works" into "feels like a
game." Each item shipped as its own small, verified, committed pass.

### Major UI restructure (minimalist fullscreen)
The first HUD was three disconnected widgets with a too-small board. It became one
cohesive ~68px top bar (player · timer · clue bars · 📜/📓/☰ tools), compact pill
actions, and the **mansion board promoted to the hero (~85% of the viewport)**. The
always-on chat log and notebook moved **behind slide-in panels** — an **Activity**
log from the left (hard size-capped with `contain: layout size` so it can't grow) and
the **Notebook** from the right — plus a **Menu** (sound toggle / how-to-play / exit).

### Hotspot Exploration System (the flagship)
Replaced "click INVESTIGATE → all clues" with **active, spatial searching**: 4
furniture **hotspots per room** (24 total in `shared/roomHotspots.js`). Walk up and
press **E** (or click) to examine one; it yields the player's clue placed there, a red
herring, or flavor text — **one outcome per hotspot per player**, discovered privately.
The **hotspot→clue mapping never leaves the server** until that exact spot is examined.
This touched the schema/validator (clues gained a `hotspot` field with placement +
per-player-uniqueness checks), the server (`tryExamine`), and the canvas (indicators +
proximity prompt).

### Sprint + modal keyboard shortcuts (2.3a)
**Shift** = 2× movement (client-side only; the server already clamps to walkable
areas). Examine/result modals close with **Enter or Esc**; because input lives on
`window`, movement resumes instantly with no canvas re-click.

### Searching animation + cute cloud bubble (2.3b/c)
Examining now plays a **2.5s "searching" state** (input locked) before the modal — a
canvas-drawn **cute white cloud thought-bubble** with bouncing charcoal dots, a gentle
bob, and puff in/out. No skip by design; `prefers-reduced-motion` pops the modal
instantly; a 5s safety timeout resets a wedged search. **No server change** — the
opponent still only sees "examining something…" on commit. Audio is wired as silent
TODO stubs, reserved for the single Phase 2.4 sound pass.

### Notable bugs caught + fixed (Phase 2)
- **"LOCK IN does nothing" couldn't be reproduced** — driven end-to-end across demo,
  fast, and real Dev-Mode-gated timers in 2-tab Chrome; it worked every time. The real
  takeaway: verify in a real browser before chasing a phantom.
- **Activity panel could grow** with long messages → fixed box + CSS containment,
  proven by injecting 100 messages and asserting the size never changes.
- **Room-entry "stuck at the threshold"** only showed in real play; closed-loop
  movement tests confirmed all six rooms are reachable and the geometry is sound.
- **favicon 404** in the console → added an inline SVG favicon so the console is clean.
- **Test-harness gotchas:** socket tests need `WHISPERS_FAST_TIMERS=1` (the
  timer-transition test waits out the soft/window timers — `=demo`'s 15-min cap hangs
  it); and one e2e measured the 2.5s search from the wrong start point (a *test* bug,
  not the feature).

### Lessons learned
- **Plan mode caught 3 spec/code mismatches before a line was written** — the hotspot
  request named `room`/`points_to` and `server/ai/validateCase.js`, but the code uses
  `found_in`/`eliminates` and validates in `shared/caseSchema.js`. Reconciling on paper
  saved hours of debugging.
- **One serializer (`buildView`) keeps privacy auditable** — every new field (examined
  hotspots, lock flags) is private by construction.
- **`window`-level input** means modals/animations can lock gameplay without stealing
  keyboard focus — closing a modal needs no extra "click the canvas" step.

---

## 7. What's Next

Phases 1 and 2 (minus audio) are complete and on GitHub. The immediate next step is
**Phase 2.4 — Audio**: filling the already-stubbed sound hooks (searching loop, clue
ding, footsteps, ambient storm, UI/dramatic stings) from CC0 sources. After that:
idle/speech-bubble animations, then Phase 3 content — **live `claude-opus-4-8`
generation** (awaiting credits), themed maps, and a **multi-floor mansion**. The full
status board lives in **[ROADMAP.md](ROADMAP.md)**; session context in
**[CLAUDE.md](CLAUDE.md)**.
