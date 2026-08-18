// Offscreen cache for the STATIC half of the mansion board.
//
// Why this exists: the board used to be repainted in full on every animation
// frame — ~168 stroked mortar/plank lines, six measureText calls, live seeded
// loops drawing ~150 tiny book-spine rects, and five createRadialGradient
// ALLOCATIONS, sixty times a second. That is both a waste and, more importantly,
// a hard ceiling on how detailed the art could get: anything you draw per-frame
// you pay for per-frame.
//
// None of that content varies — not between frames, not between players. So it
// is painted ONCE into an offscreen canvas and blitted thereafter, which makes
// wall bands, floor patterns, baked shadows and a full lighting pass essentially
// free at runtime.
//
// The cache is a module-level singleton on purpose. BoardCanvas (gameplay) and
// menuScene (the idle main-menu scene) both render the same static board, so
// they legitimately share one bake — and the cache surviving MenuBackdrop's
// unmount when a game starts is the point, not a leak.
//
// Deliberately NOT OffscreenCanvas: no benefit for a one-off bake, one more
// compatibility surface to worry about.
import { BOARD_W, BOARD_H } from "./boardData.js";

let bg = null;
let bakes = 0;

/**
 * Returns the cached static layer, baking it on first use.
 * @param {(ctx: CanvasRenderingContext2D) => void} paint - painter for the
 *   static content. Injected rather than imported so this module never has to
 *   import drawBoard.js, which imports this one (that would be a cycle).
 */
export function getBoardLayers(paint) {
  if (bg) return { bg };
  const canvas = document.createElement("canvas");
  canvas.width = BOARD_W;
  canvas.height = BOARD_H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  paint(ctx);
  bg = canvas;
  bakes++;
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    // Dev handle so a runaway invalidation shows up as a failing assertion
    // rather than as an unexplained framerate drop.
    window.__wrBoard = { get bakes() { return bakes; } };
  }
  return { bg };
}

// Drop the cache; the next getBoardLayers() rebuilds it. Rare by design — the
// game loop must NEVER call this. Real triggers: furniture sprites finishing an
// async load (the art changes underneath the bake), and HMR disposal in dev.
export function invalidateBoardLayers() {
  bg = null;
}

export const bakeCount = () => bakes;

if (import.meta.hot) import.meta.hot.dispose(() => invalidateBoardLayers());
