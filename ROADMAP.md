# Roadmap — Whispers at Ravenhurst

> **Last updated:** 2026-06-16

Progress tracker for the project. Phase 1 (the vertical slice) is mostly complete
and the game is playable end-to-end; Phases 2–4 are planned and have **not** been
started.

---

## Status legend

| Marker | Meaning |
|--------|---------|
| ✅ | Done |
| 🟡 | Partial |
| ⬜ | Stub |
| ⏳ | Deferred |
| 🔜 | Planned |

---

## Phase 1 — Vertical Slice · *mostly complete*

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Project scaffolding (client + server + shared) | ✅ | `npm run dev` runs both |
| 2 | Lobby — create/join, room codes, auto-start | ✅ | + server-authoritative movement validation |
| 3 | Mansion board render (canvas) | ✅ | reconciled to shared map data |
| 4 | Sprites + click-to-move + WASD | ✅ | now full free-roam WASD/arrows with collision |
| 5 | WebSocket clue-count sync + ambient chat | 🟡 | counts/sync solid; ambient flavour still minimal |
| 6 | AI case generator + validator | ✅ | baked case + validator complete; **live `claude-opus-4-8` API ⏳ deferred** |
| 7 | Investigation mechanic (reveal clues per room) | ✅ | reveal-all-per-room, per-player "searched" |
| 8 | Suspect questioning (dialogue trees, 3-question cap, confront) | ✅ | one branch served at a time |
| 9 | Notebook UI (Suspects/Weapons/Rooms tabs, evidence list) | ✅ | 3-state local marks |
| 10 | Accusation system (dual-window timer, scoring, reveal) | ✅ | base + reasoning + speed |
| 11 | Anti-cheat (server-authoritative, solution never leaks) | ✅ | single `buildView` serializer, test-covered |
| 12 | Disconnect handling | 🟡 | detected + 30 s cleanup; **token-based rejoin not yet wired** |

---

## Current polish round · *in progress*

The recent sessions tackled the issues surfaced by full two-tab playtests. Status
of the items called out for this round:

- ✅ **UI layout fixes** — clutter, the `0/7` overflow on the clue tracker,
  mansion-board sizing (now the visual hero), title placement (prominent centred
  header), wasted screen space, and panel organisation (a unified top HUD bar).
- ✅ **Movement fixes** — free 4-directional movement in every room (centred
  spawns) and tightened wall/doorway collision (no more clipping past walls);
  covered by `server/test/movement.js`.
- ✅ **Question-pool rewrite** — a ten-question pool with a flavourful
  Victorian-detective tone, plus matching character-specific answers and tells.
- ✅ **Timer urgency** — five escalating visual/audio tiers (`urgencyTier`) with
  colour, pace, ticks, and a final-30 s vignette; pressure is visible from 5:00 on.
- 🟡 **Further visual polish** — ongoing (continues as its own track, separate from
  the Phase 2 feature work below).

---

## Phase 2 — Polish & Immersion · *planned, not started*

### Flagship feature: Hotspot Exploration System 🔜

Transform the game from menu-clicking into actual detective work. Instead of
clicking **INVESTIGATE** and instantly receiving all clues for a room, players
actively search specific locations within each room.

**Design**

- Each room has **3–4 interactable hotspots**, e.g.:
  - *Library:* bookshelf, desk, fireplace, reading chair
  - *Kitchen:* knife rack, sink, pantry, trash bin
  - *Conservatory:* plant pots, window, bench
- On entering a room, small subtle indicators (a magnifying-glass icon or
  sparkles) appear above hotspots.
- Walking near a hotspot triggers a **"Press E to examine"** prompt.
- Pressing **E** opens a small modal, e.g. *"You examine the bookshelf
  carefully… A leather-bound diary is wedged behind the third volume.
  (CLUE FOUND)."*
- Each hotspot has **one outcome per player per game**:
  - Real clue (~60%)
  - Red-herring clue (~15%)
  - Flavour text only — *"Nothing of interest here."* (~25%)
- Examined hotspots show a ✓ checkmark overlay for that player.
- Hotspots track **separately per player** (privacy maintained).

**Data-model changes required**

- Add `shared/roomHotspots.js` defining hotspots per room (`id`, `name`,
  position coordinates within the room).
- Update `shared/caseSchema.js`: clues gain a `hotspot` field tying them to
  specific hotspots (not just rooms).
- Update the validator (`validateCase` in `shared/caseSchema.js`): ensure clues
  reference valid hotspots.
- Update `server/ai/generateCase.js`: prompt the AI to place clues in specific
  hotspots.
- Update `server/ai/fallbackCase.json`: rewrite clues with hotspot mappings.
- Update `server/handlers/investigate.js`: accept a `hotspot_id` parameter and
  return only the clue for that specific hotspot.
- Frontend: render hotspot click-zones over the existing pixel-art furniture (no
  new art needed — reuse what's there).

**Why this matters**

- Makes the game feel like a real detective game, not menu-clicking.
- Adds a spatial puzzle layer (*where* to look, not just *what* to deduce).
- Massively differentiates from typical student projects.
- Each room becomes a place to explore, not a button to press.
- Maintains all existing systems (clue counts, herrings, privacy) — just adds
  granularity.

**Alternative lighter version** (if scope is too large)

- A single "search location" picker per room.
- Click **INVESTIGATE** → modal: *"Where do you search?"*
- Options: furniture / walls & paintings / windows & doors / fireplace.
- Pick one → reveals one clue from that area.
- ~30% of the work, ~80% of the feel.

### Audio & Atmosphere Polish 🔜

- **Footstep sounds** — a *tum-tum-tum* loop during Walking, silent on Idle.
- **Ambient atmosphere** — distant footsteps, door creaks, wind, thunder, faint
  whispers.
- **Clock-pressure escalation** (audio layered onto the existing visual tiers):
  - 10:00–5:00 — green timer, calm tick
  - 5:00–3:00 — yellow, faster ticks
  - 3:00–1:00 — orange, heartbeat tick
  - 1:00–0:30 — red, rapid pulse
  - under 0:30 — bright red, urgent pulse + screen vignette flash
- **Speech bubbles** above the character:
  - Investigating: `...`
  - Finding a clue: `!` or `Aha!`
  - Questioning a suspect: `?`
  - Disappear after 2–3 seconds.
- **Idle character animations** (loop while standing still):
  - Holmes: takes a drag from his pipe, adjusts the deerstalker
  - Watson: checks his pocket watch, fixes his bowler hat
  - Both: occasionally look around nervously
- **Scripted scare event at the 5-minute mark:**
  - Lights flicker
  - Scream sound plays
  - A new clue appears: *"The body was moved"*
  - Brief shadow flicker on screen
- **Hostile suspect dialogue** — after 3 questions wasted on a suspect, they become
  more aggressive / refuse to answer further.

---

## Phase 3 — Content Expansion · *future*

- 🔜 **Live `claude-opus-4-8` API integration** — replaces the baked fallback case
  (the slot-in point already exists in `server/ai/generateCase.js`; runs every
  generated case through `validateCase` and falls back on any failure).
- 🔜 **Map 2: Moonlight Hotel** (1920s art-deco aesthetic)
  - 6 themed rooms: Ballroom, Bar, Suites, Lobby, Roof Terrace, Manager's Office
  - 8–10 1920s-style suspect portraits via Pixellab
- 🔜 **Map 3: Blackthorn Estate** (Gothic aesthetic)
  - 6 themed rooms: Chapel, Crypt, Tower, Conservatory, Hall, Servants' Quarters
  - 8–10 Gothic-style suspect portraits
- 🔜 **Random map selection** per game session.
- 🔜 **Hotspot system extended** to all maps.

---

## Phase 4 — Launch · *future*

- 🔜 **Meta-progression** — stats: win rate, average solve time, accuracy; title
  progression (Rookie → Seasoned Detective → Master Sleuth).
- 🔜 **Leaderboard** (optional).
- 🔜 **Deployment** — Vercel/Netlify for the frontend, Railway/Render for the
  backend WebSocket server.
- 🔜 **Demo video / GIF** for the portfolio.
- 🔜 **itch.io launch** (optional — indie-game community visibility).

---

> **Note:** The Hotspot Exploration System and all other Phase 2+ items are
> **planned only** and documented here for future work. They will each be built in
> their own focused sessions. The current track is finishing UI/UX polish.
