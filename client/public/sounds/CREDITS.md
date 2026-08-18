# Sound Credits — Whispers at Ravenhurst

All audio was taken from **CC0 / royalty-free** libraries (freesound.org, Pixabay,
Mixkit). CC0 requires no attribution, but every asset is logged here for provenance
and portfolio transparency.

> ⚠️ **Maintainer note — PRE-LAUNCH BLOCKER.** The per-file source URLs were never
> recorded, so the `CC0` license column below is **an unverified assumption, not a
> confirmed fact**. Before any public release: re-locate the page each clip was
> downloaded from, paste the URL into the Source column, and confirm the licence. If
> a clip turns out to be **CC-BY** (attribution required) rather than CC0, record the
> author + link in the License column. Any clip whose provenance cannot be
> re-established should be replaced with one that has a documented source.

## Phase 2.4a — Critical sounds (integrated)

| File | Used for | Source | License |
|------|----------|--------|---------|
| `examination/searching.mp3` | Looping rustle during the 2.5s hotspot search | ⚠️ pending verification | CC0 (unverified) |
| `examination/clue_found.mp3` | Ding when an examined hotspot yields a clue | ⚠️ pending verification | CC0 (unverified) |
| `examination/nothing_found.mp3` | Soft whoosh when a hotspot is empty | ⚠️ pending verification | CC0 (unverified) |
| `movement/footsteps_walk.mp3` | Looping footsteps while walking | ⚠️ pending verification | CC0 (unverified) |
| `movement/footsteps_sprint.mp3` | Looping footsteps while sprinting (Shift) | ⚠️ pending verification | CC0 (unverified) |
| `timer/tick_burst.mp3` | One-shot ~3s clock tick burst at the 1:00 mark | ⚠️ pending verification | CC0 (unverified) |

## Phase 2.4b — Ambient + UI + dramatic (integrated)

| File | Used for | Source | License |
|------|----------|--------|---------|
| `ambient/rain_loop.mp3` | Near-subliminal looping rain bed under the whole game (vol 0.04) | ⚠️ pending verification | CC0 (unverified) |
| `ambient/door_creak.mp3` | Random atmospheric creak (30–90s scheduler) | ⚠️ pending verification | CC0 (unverified) |
| `ambient/floor_creak.mp3` | Random atmospheric creak (30–90s scheduler) | ⚠️ pending verification | CC0 (unverified) |
| `ui/button_click.mp3` | Soft click on EVERY button (delegated capture-phase listener, vol 0.35) | ⚠️ pending verification | CC0 (unverified) |
| `ui/notebook_open.mp3` | Swish on every Notebook interaction — open, tab switch, close (vol 0.40) | ⚠️ pending verification | CC0 (unverified) |
| `dramatic/accusation_lockin.mp3` | Sting on the "LOCKED IN — awaiting opponent" moment | ⚠️ pending verification | CC0 (unverified) |
| `dramatic/reveal.mp3` | Sting the instant the reveal screen unveils the truth | ⚠️ pending verification | CC0 (unverified) |

> ⚠️ `ambient/rain_loop.mp3` is ~19 MB — it's preloaded, so it dominates first-load
> bandwidth. Consider re-encoding to a lower bitrate / shorter seamless loop before launch.

## How these are wired

The sound manager is `client/src/game/sound.js` (HTML5 `<audio>`, preloaded on app
start). Volumes, the global mute (menu **Sound: ON/OFF**, persisted in
`localStorage`), and autoplay-unlock-on-first-gesture all live there. Event wiring:
footsteps in `BoardCanvas.jsx` (movement-state transitions); searching + clue/nothing
+ tick burst + rain lifecycle + creak scheduler + notebook swish + accusation-lock-in +
reveal stings + the universal UI button click (one delegated capture-phase `<button>`
listener) all in `App.jsx`.

## Still deferred (future polish pass)

Not yet sourced/added: `ambient/wind.mp3` + a thunder layer (the storm bed is rain-only
for now), `ambient/distant_footsteps.mp3`, `ambient/whisper.mp3`, and the
`ui/modal_open.mp3` / `ui/modal_close.mp3` pair. See `CLAUDE.md → Sound Assets TODO`.
