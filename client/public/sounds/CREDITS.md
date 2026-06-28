# Sound Credits — Whispers at Ravenhurst

All audio is sourced from **CC0 / royalty-free** libraries (freesound.org, Pixabay,
Mixkit). CC0 requires no attribution, but every asset is logged here for provenance
and portfolio transparency.

> ⚠️ **Maintainer note:** the exact per-file source URLs below are placeholders —
> fill in the page you downloaded each clip from. If any clip turns out to be
> **CC-BY** (attribution required) rather than CC0, record the author + link in the
> License column before shipping.

## Phase 2.4a — Critical sounds (integrated)

| File | Used for | Source | License |
|------|----------|--------|---------|
| `examination/searching.mp3` | Looping rustle during the 2.5s hotspot search | _TODO: source URL_ | CC0 |
| `examination/clue_found.mp3` | Ding when an examined hotspot yields a clue | _TODO: source URL_ | CC0 |
| `examination/nothing_found.mp3` | Soft whoosh when a hotspot is empty | _TODO: source URL_ | CC0 |
| `movement/footsteps_walk.mp3` | Looping footsteps while walking | _TODO: source URL_ | CC0 |
| `movement/footsteps_sprint.mp3` | Looping footsteps while sprinting (Shift) | _TODO: source URL_ | CC0 |
| `timer/tick_burst.mp3` | One-shot ~3s clock tick burst at the 1:00 mark | _TODO: source URL_ | CC0 |

## How these are wired

The sound manager is `client/src/game/sound.js` (HTML5 `<audio>`, preloaded on app
start). Volumes, the global mute (menu **Sound: ON/OFF**, persisted in
`localStorage`), and autoplay-unlock-on-first-gesture all live there. Event wiring:
footsteps in `BoardCanvas.jsx` (movement-state transitions), searching + clue/nothing
+ tick burst in `App.jsx`.

## Not yet added (Phase 2.4b — next pass)

Ambient storm loop (rain + thunder + wind), random distant sfx (door creak, whispers,
floor creak), UI sfx (modal/button/notebook), and dramatic stings (accusation lock-in,
reveal). See `CLAUDE.md → Sound Assets TODO`.
