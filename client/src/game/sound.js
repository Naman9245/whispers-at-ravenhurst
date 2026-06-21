// Minimal Web-Audio bank. The game is deliberately quiet: the ONLY sound is a
// short clock tick, fired by App as a ~3-second burst at the 1:00-remaining mark
// (then silence). No assets — the tick is synthesized, so it adds no weight.
// Browsers block audio until a user gesture, so unlock() runs on the first click.
let ctx = null;
let unlocked = false;
let muted = false;

// Toggle all game sound (the menu's Sound: ON/OFF control).
export function setMuted(v) { muted = Boolean(v); }
export function isMuted() { return muted; }

function audio() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  } catch { /* audio unsupported — stay silent */ }
  return ctx;
}

// Call from a user gesture (a click/keypress) to satisfy autoplay policies.
export function unlockAudio() {
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  unlocked = true;
}

// One short clock tick.
export function playTick() {
  const c = audio();
  if (!c || !unlocked || muted) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "square";
  osc.frequency.value = 760;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + 0.08);
}

// ---- hotspot examination sound HOOKS (Phase 2.3b) --------------------------
// Intentionally silent for now — the actual audio assets are sourced together in
// Phase 2.4. These stubs let the searching flow call them today with zero effect,
// so the visual experience works perfectly with no sound present. All respect the
// existing unlocked/muted gates once implemented.

// Looping "searching" sound (paper rustling / drawer / shuffle). Returns a stop()
// to call when the search ends. TODO(Phase 2.4): load + loop the rustle asset.
export function playSearchingLoop() {
  // TODO(Phase 2.4): start the looping searching sfx here (respect unlocked/muted).
  return () => {
    // TODO(Phase 2.4): stop/fade the looping searching sfx.
  };
}

// Brief "ding" when the modal opens on a found clue.
export function playClueFound() {
  // TODO(Phase 2.4): play the clue-found ding (respect unlocked/muted).
}

// Soft "whoosh" when the modal opens on an empty hotspot.
export function playNothingFound() {
  // TODO(Phase 2.4): play the soft nothing-found whoosh (respect unlocked/muted).
}
