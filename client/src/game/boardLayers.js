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

// The bake is stored at BAKE_SCALE x board resolution. The gameplay camera zooms
// IN on the board, and magnifying a 1:1 bitmap turns the mortar lines, book
// spines and room labels to mush. Baking at 2x means the camera minifies a
// larger source instead, which stays crisp. 2944x1720x4B is about 20 MB — fine;
// 3x would be 45 MB, which is not.
//
// Callers get the scale back and MUST apply it to any SOURCE rectangle they read
// out of the bitmap (see drawOccluders). Destination coordinates stay in board
// units, because the bake context is pre-scaled: paintStatic and its ~600 lines
// of helpers keep drawing in world units, unchanged.
export const BAKE_SCALE = 2;

let bg = null;
let bakes = 0;

/**
 * Returns the cached static layer, baking it on first use.
 * @param {(ctx: CanvasRenderingContext2D) => void} paint - painter for the
 *   static content. Injected rather than imported so this module never has to
 *   import drawBoard.js, which imports this one (that would be a cycle).
 * @returns {{ bg: HTMLCanvasElement, scale: number }}
 */
export function getBoardLayers(paint) {
  if (bg) return { bg, scale: BAKE_SCALE };
  const canvas = document.createElement("canvas");
  canvas.width = BOARD_W * BAKE_SCALE;
  canvas.height = BOARD_H * BAKE_SCALE;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  // Pre-scale so the painter never has to know the bake is oversized.
  ctx.setTransform(BAKE_SCALE, 0, 0, BAKE_SCALE, 0, 0);
  paint(ctx);
  bg = canvas;
  bakes++;
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    // Dev handle so a runaway invalidation shows up as a failing assertion
    // rather than as an unexplained framerate drop.
    window.__wrBoard = { get bakes() { return bakes; }, scale: BAKE_SCALE };
  }
  return { bg, scale: BAKE_SCALE };
}

// Drop the cache; the next getBoardLayers() rebuilds it. Rare by design — the
// game loop must NEVER call this. Real triggers: furniture sprites finishing an
// async load (the art changes underneath the bake), and HMR disposal in dev.
export function invalidateBoardLayers() {
  bg = null;
}

export const bakeCount = () => bakes;

if (import.meta.hot) import.meta.hot.dispose(() => invalidateBoardLayers());
