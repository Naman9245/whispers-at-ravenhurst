// HTML5 <audio> sound manager for Whispers at Ravenhurst (Phase 2.4a + 2.4b).
//
// One preloaded, one-file-per-event <audio> element per sound. Pass 1 (2.4a):
// a looping "searching" rustle, a clue-found ding, a nothing-found whoosh,
// looping walk/sprint footsteps, and a one-shot ~3s tick burst at the 1:00
// mark. Pass 2 (2.4b) adds ambience + UI + dramatic stings: a quiet looping
// rain bed, random door/floor creaks, a UI button click, a notebook-open
// swish, and the accusation-lock-in / reveal stings. Everything respects a
// global mute (the menu's Sound: ON/OFF) and the browser autoplay policy —
// nothing is audible until unlockAudio() runs inside the first user gesture.
//
// Design notes:
//  • One <audio> element per sound, so a sound can't stack on itself — a repeat
//    play just restarts (one-shots) or is ignored (a loop already running).
//  • Footsteps are a tiny state machine (idle/walk/sprint). The BoardCanvas
//    render loop calls these helpers every frame; they no-op unless the state
//    actually changes, so there is never a per-frame restart.
//  • The rain bed is a loop like footsteps but has no state machine — App owns
//    its lifecycle (start on gameplay, stop on reveal/lobby, resume on unmute).

// Per-sound source + behaviour. Volumes are the tunable knobs. The rain bed sits
// deliberately BELOW every gameplay-critical sound (footsteps 0.20+, searching
// 0.30, dings 0.30+) so constant ambience never competes with feedback; the
// tick burst and the dramatic stings are the loudest (urgency / punctuation).
const SOUNDS = {
  searching:        { src: "/sounds/examination/searching.mp3",      loop: true,  volume: 0.30 },
  clueFound:        { src: "/sounds/examination/clue_found.mp3",      loop: false, volume: 0.50 },
  nothingFound:     { src: "/sounds/examination/nothing_found.mp3",   loop: false, volume: 0.30 },
  footstepsWalk:    { src: "/sounds/movement/footsteps_walk.mp3",     loop: true,  volume: 0.20 },
  // Louder than the walk loop on purpose. A sprint inside a furnished room only
  // sustains ~800ms before the feet meet furniture, so this fires as a short
  // burst rather than a steady bed — at 0.25 it was easy to miss entirely.
  footstepsSprint:  { src: "/sounds/movement/footsteps_sprint.mp3",   loop: true,  volume: 0.42 },
  tickBurst:        { src: "/sounds/timer/tick_burst.mp3",            loop: false, volume: 0.60 },
  // --- 2.4b: ambient bed + random atmospheric creaks ---
  // Rain is deliberately near-subliminal (0.04) — a faint "weather outside" bed,
  // not something you consciously notice over a long session.
  rain:             { src: "/sounds/ambient/rain_loop.mp3",           loop: true,  volume: 0.04 },
  doorCreak:        { src: "/sounds/ambient/door_creak.mp3",          loop: false, volume: 0.18 },
  floorCreak:       { src: "/sounds/ambient/floor_creak.mp3",         loop: false, volume: 0.15 },
  // --- 2.4b: UI ---
  buttonClick:      { src: "/sounds/ui/button_click.mp3",            loop: false, volume: 0.35 },
  notebookOpen:     { src: "/sounds/ui/notebook_open.mp3",           loop: false, volume: 0.40 },
  // --- 2.4b: dramatic stings ---
  accusationLockIn: { src: "/sounds/dramatic/accusation_lockin.mp3", loop: false, volume: 0.50 },
  reveal:           { src: "/sounds/dramatic/reveal.mp3",            loop: false, volume: 0.50 },
};

let muted = false;
let unlocked = false;
let footState = "idle";       // "idle" | "walk" | "sprint"
const plays = {};             // per-sound play count (observability; drives the dev handle)
const loopIntent = new Set(); // loop keys we intend to keep alive (drives self-heal)
const oneShots = new Set();   // live one-shot clones, referenced until they finish

// Preload one <audio> element per sound on import (i.e. at app start). Guarded so
// non-browser environments (node tests/SSR) don't throw on `new Audio`.
const bank = (typeof Audio !== "undefined")
  ? Object.fromEntries(Object.entries(SOUNDS).map(([key, s]) => {
      const a = new Audio(s.src);
      a.preload = "auto";
      a.loop = s.loop;
      a.volume = s.volume;
      // Self-heal loops: if a loop element ever fires `ended` (loop somehow
      // dropped, a decode hiccup, a boundary glitch on the long rain file…),
      // restart it as long as we still intend it to play. Guarantees the rain
      // bed never dies during menu/lobby/game until we explicitly halt it.
      if (s.loop) a.addEventListener("ended", () => {
        if (loopIntent.has(key) && !muted && unlocked) {
          try { a.currentTime = 0; a.play()?.catch(() => {}); } catch { /* ignore */ }
        }
      });
      return [key, a];
    }))
  : null;

const el = (key) => (bank ? bank[key] : null);

// ---- mute (the menu's Sound: ON/OFF) --------------------------------------
export function setMuted(v) {
  muted = Boolean(v);
  if (muted) stopAll();   // silence anything currently playing immediately
}
export function isMuted() { return muted; }

// ---- low-level helpers ----------------------------------------------------
// One-shot: play a fresh CLONE so rapid/overlapping presses each play cleanly
// from the start. A single <audio> element can't retrigger reliably mid-play —
// that's the "sometimes silent" click. Clones are cheap (the file is already
// cached), are kept referenced so they can't be GC'd mid-play, and self-remove
// when they finish.
function fire(key) {
  const base = el(key);
  if (!base || muted || !unlocked) return;
  try {
    const node = base.cloneNode(true);
    node.loop = false;
    node.volume = base.volume;
    oneShots.add(node);
    const done = () => oneShots.delete(node);
    node.addEventListener("ended", done, { once: true });
    node.addEventListener("error", done, { once: true });
    node.play()?.catch(done);
    plays[key] = (plays[key] || 0) + 1;
  } catch { /* ignore */ }
}
// Loop: start only if not already running, so repeated calls don't restart it.
// Records loop intent + re-asserts `loop=true` so the bed genuinely loops forever.
function startLoop(key) {
  const a = el(key);
  if (!a || muted || !unlocked) return;
  loopIntent.add(key);
  a.loop = true;
  if (!a.paused) return;
  try { a.currentTime = 0; a.play()?.catch(() => {}); plays[key] = (plays[key] || 0) + 1; } catch { /* ignore */ }
}
// Stop + rewind. Safe to call when already stopped (no-op). Clears loop intent
// so the self-heal handler won't resurrect a deliberately-stopped loop.
function halt(key) {
  const a = el(key);
  if (!a) return;
  loopIntent.delete(key);
  try { a.pause(); a.currentTime = 0; } catch { /* ignore */ }
}
function stopAll() {
  if (!bank) return;
  for (const key of Object.keys(bank)) halt(key);
  for (const node of oneShots) { try { node.pause(); } catch { /* ignore */ } }
  oneShots.clear();
  footState = "idle";
}

// ---- autoplay unlock ------------------------------------------------------
// Call from the FIRST real user gesture. Primes every element (muted play→pause)
// so later programmatic plays — the clue/nothing dings, the timer tick burst,
// and the rAF-driven footstep loops, none of which originate in a gesture — are
// allowed by the browser autoplay policy.
//
// Returns a promise that resolves once ALL priming has settled. Callers that
// want to start a loop right after unlocking (the main menu's rain bed) must
// wait for it: mid-prime an element is playing-muted, so startLoop's "already
// running" guard would skip it and the prime's pause() would then silence it.
export function unlockAudio() {
  if (unlocked || !bank) return Promise.resolve();
  unlocked = true;
  const primes = Object.values(bank).map((a) => {
    try {
      a.muted = true;
      const p = a.play();
      if (p?.then) return p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
      a.pause(); a.currentTime = 0; a.muted = false;
    } catch { a.muted = false; }
    return Promise.resolve();
  });
  return Promise.allSettled(primes);
}

// ---- examination (App's 2.5s searching flow) ------------------------------
export function playSearching()    { startLoop("searching"); }
export function stopSearching()    { halt("searching"); }
export function playClueFound()    { fire("clueFound"); }
export function playNothingFound() { fire("nothingFound"); }

// ---- movement footsteps ---------------------------------------------------
// walk and sprint are mutually exclusive; switching swaps cleanly. The guard in
// setFootState makes every-frame calls from the render loop free of restarts.
function setFootState(next) {
  const target = muted ? "idle" : next;   // while muted, hold idle so unmute re-triggers
  if (target === footState) return;
  if (footState === "walk") halt("footstepsWalk");
  else if (footState === "sprint") halt("footstepsSprint");
  footState = target;
  if (target === "walk") startLoop("footstepsWalk");
  else if (target === "sprint") startLoop("footstepsSprint");
}
export function playFootstepsWalk()   { setFootState("walk"); }
export function playFootstepsSprint() { setFootState("sprint"); }
export function stopFootsteps()       { setFootState("idle"); }

// ---- timer ----------------------------------------------------------------
// One ~3-second tick-burst mp3 at the 1:00 mark, then silence (App fires it once).
export function playTickBurst() { fire("tickBurst"); }

// ---- 2.4b ambient bed (App owns the lifecycle) ----------------------------
// A quiet rain loop under the whole game. Like footsteps it's a loop, but there
// is no state machine: App starts it when gameplay begins and stops it at the
// reveal / on return to lobby. While muted, playRainLoop no-ops; App re-calls it
// on unmute so the bed resumes. startLoop's "already running" guard makes any
// extra playRainLoop() call harmless.
export function playRainLoop() { startLoop("rain"); }
export function stopRainLoop() { halt("rain"); }

// ---- 2.4b random atmospheric creaks (App schedules these) -----------------
export function playDoorCreak()  { fire("doorCreak"); }
export function playFloorCreak() { fire("floorCreak"); }

// ---- 2.4b UI --------------------------------------------------------------
export function playButtonClick()  { fire("buttonClick"); }
export function playNotebookOpen() { fire("notebookOpen"); }

// ---- 2.4b dramatic stings -------------------------------------------------
export function playAccusationLockIn() { fire("accusationLockIn"); }
export function playReveal()           { fire("reveal"); }

// Dev-only handle so e2e playtests can assert audio state (mirrors window.__wrChar).
// `fire` exposes the one-shot triggers so e2e can exercise the random creaks
// deterministically without waiting out their 30–90s scheduler (all still route
// through fire(), so mute/unlock behaviour is exactly the real thing).
if (typeof window !== "undefined" && import.meta.env.DEV && bank) {
  window.__wrAudio = {
    bank,
    state: () => ({
      muted, unlocked, footState,
      plays: { ...plays },
      playing: Object.fromEntries(Object.entries(bank).map(([k, a]) => [k, !a.paused])),
    }),
    fire: { playDoorCreak, playFloorCreak, playButtonClick, playNotebookOpen, playAccusationLockIn, playReveal },
  };
}
