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

### 2.2 — Hotspot Exploration System ✅ *(FLAGSHIP FEATURE — DONE)*

Investigation is now active, spatial searching instead of one button.

**Shipped**
- **4 hotspots per room** (24 total) in `shared/roomHotspots.js`, positioned over the
  drawn furniture.
- Entering a room shows its 4 subtle pulsing magnifying-glass indicators (**current
  room only**); examined spots show a faded ✓.
- Walk within ~48px → a **"Press E to examine"** prompt; **the E key or a
  proximity-gated mouse click** examines it.
- Each hotspot yields the player's clue placed there (if any) or "Nothing of interest
  here." — one outcome per hotspot per player, tracked privately.
- The old **INVESTIGATE button was removed**; examination replaces it.
- Notebook evidence shows "Room — Hotspot name"; the Rooms tab shows per-room search
  progress (`n/4` → ✓ Searched).

**Anti-cheat:** the hotspot→clue mapping never leaves the server until the player
examines that exact spot (`tryExamine` in `server/game.js`, event `hotspot:examine`).

**Files:** `shared/roomHotspots.js` (new) · `shared/caseSchema.js` (+hotspot checks) ·
`server/ai/fallbackCase.json` (every clue gets a `hotspot`) · `server/game.js`
(`tryExamine`, `examinedHotspots`) · `server/handlers/investigate.js` · `server/views.js` ·
client (`drawBoard.js` `drawHotspots`, `BoardCanvas.jsx`, new `ExamineModal.jsx`,
`App.jsx`, `ActionBar.jsx`, `DeductionNotebook.jsx`). Tests: new `server/test/hotspots.js`
+ updated `lobbyFlow` / `lockout` / `caseValidation`.

> Note vs. the original spec: clues keep the existing `found_in` / `eliminates` fields
> (not `room` / `points_to`); validation lives in `shared/caseSchema.js` (there is no
> `server/ai/validateCase.js`); the full walk-up + E version was shipped (not the
> lighter modal-picker fallback).

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
