# Roadmap — Whispers at Ravenhurst

> **Last updated:** 2026-06-20

Progress tracker for the project. **Phase 1 (the vertical slice) is complete** and
the game is playable end-to-end; Phase 2 is the next focus.

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
| 1 | Project scaffolding (client + server + shared) | ✅ | `npm run dev` runs both |
| 2 | Lobby — create/join, room codes | ✅ | 5-char unambiguous codes, auto-start on 2 players |
| 3 | Mansion board render (canvas) | ✅ | reconciled to shared map data |
| 4 | Sprites + click-to-move + WASD | ✅ | full free-roam WASD/arrows with collision |
| 5 | WebSocket clue-count sync + ambient chat | ✅ | real per-player counts; vague location-free chat |
| 6 | AI case generator + validator | ✅ | fallback case + validator complete; **live `claude-opus-4-8` API → Phase 2.1** |
| 7 | Investigation mechanic | ✅ | reveal-all-per-room, per-player "searched" |
| 8 | Suspect questioning | ✅ | dialogue trees, 3-question cap, evidence confront |
| 9 | Notebook UI | ✅ | Suspects/Weapons/Rooms tabs, 3-state marks, evidence list |
| 10 | Accusation system with dual-window timers | ✅ | base + reasoning + speed scoring |
| 11 | Anti-cheat server-authoritative | ✅ | single `buildView` serializer, test-covered |
| 12 | Disconnect handling | 🟡 | detected + `peer:status` + 30s cleanup; **no token-based rejoin yet** |
| — | UI Polish: minimalist fullscreen restructure | ✅ | slim HUD, pill actions, board as hero, slide-in panels |
| — | Timer urgency design | ✅ | calm → 3s tick burst at 1:00 → red timer + edge vignette |
| — | Post-lock-in action lockout | ✅ | server rejection + client disable/freeze |

---

## Phase 2 — Polish & Immersion · **IN PROGRESS** 🔜

### 2.1 — Live Claude API Integration 🔜 *(NEXT)*
- Swap the baked fallback case for live `claude-opus-4-8` generation.
- Reuse the existing `validateCase()` pipeline.
- 3-retry logic with fallback to the baked case on failure.
- **Estimated effort:** ~1 hour.

### 2.2 — Hotspot Exploration System 🔜 *(FLAGSHIP FEATURE)*

Transform menu-click investigation into actual room searching.

**Design**
- 3–4 interactable hotspots per room (e.g. *Library:* bookshelf, desk, fireplace,
  reading chair).
- Subtle indicators (magnifying-glass icons) appear above hotspots on room entry.
- Walking near a hotspot triggers a **"Press E to examine"** prompt.
- Press **E** → modal shows what was found.
- Per-hotspot outcomes: real clue (~60%), red herring (~15%), flavor text only (~25%).
- Examined hotspots show a ✓ checkmark.
- Tracked per-player for privacy.

**Data changes**
- Add `shared/roomHotspots.js`.
- Update `shared/caseSchema.js` (clues gain a `hotspot` field).
- Update the validator (`validateCase`) — hotspot-validity check.
- Update `server/handlers/investigate.js` (accepts a `hotspot_id`).
- Update `server/ai/fallbackCase.json` with hotspot mappings.

**Why:** a spatial puzzle layer, a real detective feel, and a massive differentiator
from typical student projects.

**Alternative lighter version:** a single "search location" picker per room
(~30% of the work, ~80% of the feel).

**Estimated effort:** ~3–5 hours.

### 2.3 — Audio Polish 🔜
- Footstep sounds (a *tum-tum-tum* loop during Walking, silent on Idle).
- Ambient atmosphere: distant footsteps, door creaks, wind, thunder, faint whispers.
- 3-second tick burst at the 1:00 mark, then silence + visual urgency *(already
  implemented as the timer design; this extends the bank).*
- Sound on/off toggle in the menu *(already implemented).*
- **Estimated effort:** ~2 hours.

### 2.4 — Speech Bubbles + Idle Animations 🔜
- Speech bubbles above the character:
  - Investigating: `...`
  - Finding a clue: `!` / "Aha!"
  - Questioning a suspect: `?`
  - Disappear after 2–3 seconds.
- Idle character animations (loop while standing still):
  - Holmes: takes a drag from his pipe, adjusts the deerstalker.
  - Watson: checks his pocket watch, fixes his bowler hat.
- **Estimated effort:** ~2 hours.

### 2.5 — Scripted Scare Event 🔜 *(optional polish)*
- At the 5-minute mark: lights flicker, a scream sound plays, a new clue appears.
- Adds drama without changing the genre.

### 2.6 — Hostile Suspects After Wasted Questions 🔜 *(optional)*
- Suspects refuse to answer (or turn aggressive) after their 3 questions are used.

---

## Phase 3 — Content Expansion · **FUTURE** 🔜
- 🔜 Map 2: **Moonlight Hotel** (1920s art-deco).
- 🔜 Map 3: **Blackthorn Estate** (Gothic).
- 🔜 Random map selection per game.
- 🔜 Suspect portrait pools per map (Pixellab generation).
- 🔜 Hotspot system extended to all maps.

---

## Phase 4 — Launch · **FUTURE** 🔜
- 🔜 Token-based reconnect for disconnect handling (completes Step 12).
- 🔜 Meta-progression: stats, win rate, accuracy, titles.
- 🔜 Optional leaderboard.
- 🔜 Deployment (Vercel for the frontend, Railway/Render for the backend).
- 🔜 Demo video / GIF for the portfolio.
- 🔜 itch.io launch (optional).

---

> **Note:** All Phase 2+ items are planned and documented here for future work; each
> will be built in its own focused session. Phase 2.1 (live API) is the next track.
