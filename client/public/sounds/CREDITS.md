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

## Phase 2.4b — Ambient + UI + dramatic (integrated)

| File | Used for | Source | License |
|------|----------|--------|---------|
| `ambient/rain_loop.mp3` | Quiet looping rain bed under the whole game (vol 0.12) | _TODO: source URL_ | CC0 |
| `ambient/door_creak.mp3` | Random atmospheric creak (30–90s scheduler) | _TODO: source URL_ | CC0 |
| `ambient/floor_creak.mp3` | Random atmospheric creak (30–90s scheduler) | _TODO: source URL_ | CC0 |
| `ui/button_click.mp3` | Soft click on the primary action pills (MOVE / QUESTION / ACCUSE) | _TODO: source URL_ | CC0 |
| `ui/notebook_open.mp3` | Swish when the Notebook panel slides open | _TODO: source URL_ | CC0 |
| `dramatic/accusation_lockin.mp3` | Sting on the "LOCKED IN — awaiting opponent" moment | _TODO: source URL_ | CC0 |
| `dramatic/reveal.mp3` | Sting the instant the reveal screen unveils the truth | _TODO: source URL_ | CC0 |

> ⚠️ `ambient/rain_loop.mp3` is ~19 MB — it's preloaded, so it dominates first-load
> bandwidth. Consider re-encoding to a lower bitrate / shorter seamless loop before launch.

## How these are wired

The sound manager is `client/src/game/sound.js` (HTML5 `<audio>`, preloaded on app
start). Volumes, the global mute (menu **Sound: ON/OFF**, persisted in
`localStorage`), and autoplay-unlock-on-first-gesture all live there. Event wiring:
footsteps in `BoardCanvas.jsx` (movement-state transitions); searching + clue/nothing
+ tick burst + rain lifecycle + creak scheduler + notebook-open + accusation-lock-in +
reveal stings in `App.jsx`; the UI button click in `ActionBar.jsx`.

## Still deferred (future polish pass)

Not yet sourced/added: `ambient/wind.mp3` + a thunder layer (the storm bed is rain-only
for now), `ambient/distant_footsteps.mp3`, `ambient/whisper.mp3`, and the
`ui/modal_open.mp3` / `ui/modal_close.mp3` pair. See `CLAUDE.md → Sound Assets TODO`.
