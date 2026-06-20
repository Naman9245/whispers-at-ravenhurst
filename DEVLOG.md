# Development Log — Whispers at Ravenhurst

> **Last updated:** 2026-06-16

The story of how the game was built: the idea, the decisions that shaped it, the
"loopholes" that had to be closed for a competitive deduction game to be fair, the
build phases in order, and what playtesting surfaced.

---

## Ideation

The pitch: take the social-deduction core of Clue/Cluedo and make it a **real-time,
two-player race** instead of a turn-based board game. Two detectives, one mystery,
no turns — both explore the same manor simultaneously and the first to a
well-reasoned, correct accusation wins.

Three constraints drove every decision from the start:

1. **It must be fair.** If one player could see the other's position, clues, or the
   solution, the game is meaningless. Fairness had to be structural, not trusted.
2. **It must always be playable.** A portfolio reviewer should be able to clone,
   run, and play a complete mystery in minutes — no API key, no database, no setup.
3. **It must feel like a game, not a form.** Pixel-art mansion, animated sprites,
   real movement, a clock with teeth — not a series of dropdowns.

---

## Key design decisions

### Real-time parallel play (no turns)
Turns would have been simpler to synchronize, but they kill tension. Parallel play
means each client runs its own free-roam render loop and only the **outcomes**
(clue counts, the verdict) are shared. The trade-off: the server must be strict
about what each client is allowed to know at any instant.

### Server-authoritative, with one serializer
Rather than scatter "what can the client see?" logic across handlers, **all**
state-to-client serialization funnels through a single function, `buildView()` in
`server/views.js`. If a field isn't added there, it physically cannot reach a
client. This made the privacy guarantee auditable — and testable.

### Raw Canvas over a game engine
The board is a fixed schematic of six rooms; the only moving things are two
sprites. A full engine (Phaser) would have added a second framework alongside React
for little benefit. Raw Canvas 2D kept the lobby, board, and notebook in one React
tree and gave total control of the pixel look. (Phaser remains the documented
upgrade path if a scrolling tile world is ever needed.)

### A `/shared` package as the single source of truth
The map graph, rule constants, question pool, and case schema are imported by
**both** client and server via an `@shared` alias. The client's `boardData.js` is a
one-line re-export of `shared/mapData.js`. This makes client/server disagreement
about geometry or rules impossible by construction.

### Machine-checkable solvability
A mystery is only fun if it's actually solvable from the clues given. Clues carry
explicit `eliminates: { suspects, weapons, rooms }` data, and `validateCase()`
proves that each detective can deduce a unique, correct triple from their own
clue set. This turns "is this case fair?" from a guess into a unit test.

---

## Loopholes addressed

Building a *competitive* deduction game surfaced a series of ways a clever or
curious player could break it. Each was closed deliberately:

| Loophole | Fix |
|----------|-----|
| Opponent position could leak through the view | `buildView` reduces the opponent to `{ name, character, clueCount, lockedIn, connected }` — no `room`, ever. |
| Clue *contents* could leak in the shared payload | Clue text + the `eliminates` solver key live server-side; only the searcher receives their own clue prose, stripped of `eliminates`. |
| The solution could ride along in the case data | `publicCase()` sends only the cast/victim/weapon/room labels; the solution is withheld until `game:reveal`. |
| Red herrings could be distinguished from real clues | The `red_herring` flag is stripped from `foundClues`; the player must reason it out. Herrings are excluded from the 7-count. |
| The whole dialogue tree could be scraped | `suspect:ask`/`suspect:confront` return exactly one branch; the tree never reaches a client. |
| Opponent's accusation choices could leak pre-reveal | The accusation view carries only timing + lock **flags**; choices appear solely in the reveal. |
| Citing a contradictory clue could game the score | `_supportsSolution` grants reasoning credit only to clues that eliminate real candidates without contradicting the truth — citing your own herring scores nothing. |
| A player could walk into an unconnected room | Free-roam movement is gated by `openRooms` (current + neighbours); the server re-validates every `region:enter` against `ADJACENCY`. |
| Double game-resolution (soft timer + window + lock-in racing) | `resolve()` is idempotent — guarded on `status === "ended"`, returns `null` after the first call. |

Each of these is asserted by the test suite (`server/test/lobbyFlow.js`,
`accusation.js`, `caseValidation.js`).

---

## Build phases (chronological)

Phase 1 was built as a vertical slice — every system end-to-end, narrow but
complete. (Full status in [ROADMAP.md](ROADMAP.md).)

1. **Scaffolding** — client + server + shared packages, `npm run dev` to run both.
2. **Lobby & movement validation** — create/join by code, auto-start on two
   players, server-authoritative region tracking with adjacency checks and
   privacy-filtered views.
3. **Board render** — the mansion drawn on canvas, reconciled to the shared map.
4. **Sprites & movement** — eight-direction Walking/Idle animations; evolved from
   click-to-move to full free-roam WASD/arrow walking with collision.
5. **Clue-count sync & ambient chat** — the shared tracker shows real per-player
   counts; move/investigate emit deliberately vague chat lines.
6. **Case generation + validator** — the solvability validator and a baked,
   validated fallback case wired into game start (live API call deferred).
7. **Investigation** — reveal all of a player's clues for a room at once;
   per-player "already searched"; herrings shown but excluded from the count.
8. **Suspect questioning** — pooled questions, a 3-per-suspect cap, and evidence
   confrontation that unlocks behavioural tells; one branch served at a time.
9. **Notebook** — Suspects / Weapons / Rooms tabs with a 3-state local marking
   system and a persistent evidence list.
10. **Accusation endgame** — the 3-minute gate, dual-window timers, base +
    reasoning + speed scoring, and a simultaneous reveal with the monologue.
11. **Anti-cheat hardening** — the privacy boundary audited and covered by tests.
12. **Disconnect handling** — detection + 30-second cleanup (token-based rejoin
    still planned).

---

## Playtesting discoveries

Full two-tab playthroughs confirmed the game works end-to-end (lobby →
investigation → questioning → accusation → reveal) — and surfaced a batch of
real issues that a solo code read wouldn't have caught:

- **Movement felt one-directional in rooms.** A movement simulation against the
  shared geometry revealed the cause: the spawn/standing spot sat jammed against a
  wall, so vertical travel was lopsided. **Fix:** centre the standing spot in each
  room (now a balanced ~108 px of travel on each axis), captured by a new
  `server/test/movement.js`.
- **The sprite could clip past walls near doors.** The collision doorway gap
  (`DOOR_HALF`) was wider than the *drawn* door, so feet could stand on the wall
  beside a doorway. **Fix:** match `DOOR_HALF` to the visual door width and drive
  the drawn door off the same constant so they can't drift.
- **Suspect questions read as generic.** The original pool ("Where were you when it
  happened?") felt like a form. **Fix:** a rewritten ten-question pool with a
  pointed Victorian-detective voice, and matching period-appropriate answers with
  subtle tells for the culprit.
- **Timer urgency arrived too late.** Pressure only registered in the final minute.
  **Fix:** five escalating tiers (`urgencyTier`) — calm → warn → urgent → critical
  → final — with colour, pace, synthesized ticks, and a final-30 s vignette, all
  visible well before the end.
- **Both players forfeited a game.** The ACCUSE flow wasn't discoverable enough.
  **Fix:** a chime + toast when the window opens, a glowing/animated ACCUSE button
  with a live countdown (`ACCUSE (1:23)`), and a prominent "ACCUSE NOW or forfeit"
  warning under a minute.
- **The HUD felt like scattered widgets and the board was too small.** **Fix:** a
  full layout pass — a centred title header, a unified top HUD bar
  (identity · clock · clue tracker), the mansion board promoted to the visual hero,
  a docked log that never overlaps the board, and a compact, no-scroll notebook.

These were verified with scripted two-tab browser screenshots (Puppeteer driving
the real Chrome) showing both detectives, a populated notebook, and the clue
tracker filling correctly.

---

## What's next

The immediate focus is finishing the current UI/UX polish round. After that, the
headline Phase 2 feature is the **Hotspot Exploration System** — turning "click
INVESTIGATE, receive all clues" into active, spatial searching of specific spots
within each room. Live `claude-opus-4-8` case generation, additional themed maps,
meta-progression, and deployment follow. The full plan, with status markers, lives
in **[ROADMAP.md](ROADMAP.md)**.
