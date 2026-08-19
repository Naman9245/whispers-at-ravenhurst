// Contextual speech bubbles above the detective (Phase 2.5).
//
// The searching animation already had a cute white cloud; this reuses that same
// bubble (drawBubble in drawBoard.js) to give the character a reaction to things
// that happen — finding a clue, drawing a blank, going to question someone.
//
// Deliberately module state and NOT React state: a bubble lives for ~1.6s and is
// read once per animation frame, so routing it through a re-render would be a
// state update sixty times a second for something the canvas is already drawing.
//
// Also deliberately timestamp-scheduled with ZERO timers, matching the rule
// menuScene.js sets out: nothing to cancel means nothing can leak when React
// StrictMode double-mounts, and no stray timeout can fire into a dead canvas.
const DEFAULT_MS = 1600;

let active = null;   // { text, until }

/** Show `text` above the detective for `ms`. A newer call replaces an older one. */
export function say(text, ms = DEFAULT_MS) {
  if (!text) return;
  active = { text, until: Date.now() + ms };
}

export function clearBubble() {
  active = null;
}

/** The bubble to draw right now, or null. Expires lazily, on read. */
export function currentBubble() {
  if (active && Date.now() >= active.until) active = null;
  return active;
}

if (typeof window !== "undefined" && import.meta.env?.DEV) {
  // Mirrors __wrChar / __wrAudio so e2e can assert what the detective "said"
  // without having to read pixels off the canvas.
  window.__wrBubble = { current: currentBubble, say, clear: clearBubble };
}
