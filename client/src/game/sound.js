// HTML5 <audio> sound manager for Whispers at Ravenhurst (Phase 2.4a).
//
// Six preloaded, one-file-per-event sounds: a looping "searching" rustle, a
// clue-found ding, a nothing-found whoosh, looping walk/sprint footsteps, and a
// one-shot ~3s tick burst fired once at the 1:00 mark. Everything respects a
// global mute (the menu's Sound: ON/OFF) and the browser autoplay policy —
// nothing is audible until unlockAudio() runs inside the first user gesture.
//
// Design notes:
//  • One <audio> element per sound, so a sound can't stack on itself — a repeat
//    play just restarts (one-shots) or is ignored (a loop already running).
//  • Footsteps are a tiny state machine (idle/walk/sprint). The BoardCanvas
//    render loop calls these helpers every frame; they no-op unless the state
//    actually changes, so there is never a per-frame restart.

// Per-sound source + behaviour. Volumes are the tunable knobs: footsteps stay
// low (ambient over a 20-minute game); the tick burst is the loudest (urgency).
const SOUNDS = {
  searching:       { src: "/sounds/examination/searching.mp3",     loop: true,  volume: 0.30 },
  clueFound:       { src: "/sounds/examination/clue_found.mp3",     loop: false, volume: 0.50 },
  nothingFound:    { src: "/sounds/examination/nothing_found.mp3",  loop: false, volume: 0.30 },
  footstepsWalk:   { src: "/sounds/movement/footsteps_walk.mp3",    loop: true,  volume: 0.20 },
  footstepsSprint: { src: "/sounds/movement/footsteps_sprint.mp3",  loop: true,  volume: 0.25 },
  tickBurst:       { src: "/sounds/timer/tick_burst.mp3",           loop: false, volume: 0.60 },
};

let muted = false;
let unlocked = false;
let footState = "idle";       // "idle" | "walk" | "sprint"
const plays = {};             // per-sound play count (observability; drives the dev handle)

// Preload one <audio> element per sound on import (i.e. at app start). Guarded so
// non-browser environments (node tests/SSR) don't throw on `new Audio`.
const bank = (typeof Audio !== "undefined")
  ? Object.fromEntries(Object.entries(SOUNDS).map(([key, s]) => {
      const a = new Audio(s.src);
      a.preload = "auto";
      a.loop = s.loop;
      a.volume = s.volume;
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
// One-shot: rewind to 0 then play (a single element can't stack on itself).
function fire(key) {
  const a = el(key);
  if (!a || muted || !unlocked) return;
  try { a.currentTime = 0; a.play()?.catch(() => {}); plays[key] = (plays[key] || 0) + 1; } catch { /* ignore */ }
}
// Loop: start only if not already running, so repeated calls don't restart it.
function startLoop(key) {
  const a = el(key);
  if (!a || muted || !unlocked) return;
  if (!a.paused) return;
  try { a.currentTime = 0; a.play()?.catch(() => {}); plays[key] = (plays[key] || 0) + 1; } catch { /* ignore */ }
}
// Stop + rewind. Safe to call when already stopped (no-op).
function halt(key) {
  const a = el(key);
  if (!a) return;
  try { a.pause(); a.currentTime = 0; } catch { /* ignore */ }
}
function stopAll() {
  if (!bank) return;
  for (const key of Object.keys(bank)) halt(key);
  footState = "idle";
}

// ---- autoplay unlock ------------------------------------------------------
// Call from the FIRST real user gesture. Primes every element (muted play→pause)
// so later programmatic plays — the clue/nothing dings, the timer tick burst,
// and the rAF-driven footstep loops, none of which originate in a gesture — are
// allowed by the browser autoplay policy.
export function unlockAudio() {
  if (unlocked || !bank) return;
  unlocked = true;
  for (const a of Object.values(bank)) {
    try {
      a.muted = true;
      const p = a.play();
      if (p?.then) p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
      else { a.pause(); a.currentTime = 0; a.muted = false; }
    } catch { a.muted = false; }
  }
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

// Dev-only handle so e2e playtests can assert audio state (mirrors window.__wrChar).
if (typeof window !== "undefined" && import.meta.env.DEV && bank) {
  window.__wrAudio = {
    bank,
    state: () => ({
      muted, unlocked, footState,
      plays: { ...plays },
      playing: Object.fromEntries(Object.entries(bank).map(([k, a]) => [k, !a.paused])),
    }),
  };
}
