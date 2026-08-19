// The gameplay camera: zooms in on the mansion and follows the detective.
//
// Before this, the whole 1472x860 board was on screen at once, which read as a
// board game rather than a place you are standing in. The camera is a per-frame
// TRANSFORM, never a re-bake — `window.__wrBoard.bakes` must stay at 1.
//
// The canvas backing store deliberately stays at BOARD_W x BOARD_H. It is now a
// VIEW rather than the board, and CSS still letterboxes it to fit the viewport.
// Sizing it to the element instead would drag in a ResizeObserver, a
// devicePixelRatio decision, and a live view size that every coordinate-
// converting test would have to query first.
//
// No React, no rAF, no timers — BoardCanvas owns the loop and calls update().
import { BOARD_W, BOARD_H } from "./boardData.js";

export const VIEW_W = BOARD_W;
export const VIEW_H = BOARD_H;

// Visible world at 1.75x is ~841x491 — about two rooms across, which frames a
// room plus the doorways either side of it. Tunable: DEV builds can nudge it
// with [ and ] (see BoardCanvas) because the right value is settled by eye.
export const DEFAULT_ZOOM = 1.75;
export const MIN_ZOOM = 1.0;
export const MAX_ZOOM = 3.0;

const FOLLOW_RATE = 7;    // per second; higher = tighter follow
const SNAP_DIST = 400;    // beyond this, jump instead of easing

/**
 * @param {number} zoom
 * @returns a camera whose x/y are the WORLD point at the centre of the view.
 */
export function makeCamera(zoom = DEFAULT_ZOOM) {
  const cam = { x: BOARD_W / 2, y: BOARD_H / 2, zoom };

  // Keep the view inside the board so the player never sees the void past the
  // outer walls. If the board is narrower than the view on an axis (only at low
  // zoom), centre on that axis instead of clamping to an empty range.
  const clamp = () => {
    const halfW = VIEW_W / (2 * cam.zoom);
    const halfH = VIEW_H / (2 * cam.zoom);
    cam.x = BOARD_W <= halfW * 2 ? BOARD_W / 2 : Math.min(BOARD_W - halfW, Math.max(halfW, cam.x));
    cam.y = BOARD_H <= halfH * 2 ? BOARD_H / 2 : Math.min(BOARD_H - halfH, Math.max(halfH, cam.y));
  };

  cam.snapTo = (wx, wy) => { cam.x = wx; cam.y = wy; clamp(); };

  cam.setZoom = (z) => { cam.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)); clamp(); };

  cam.update = (dt, wx, wy) => {
    // A teleport, not a walk. The e2e suites move the detective by writing
    // window.__wrChar.x/y directly, and easing across the whole mansion after
    // one of those would leave the camera lagging for a second or more.
    if (Math.hypot(wx - cam.x, wy - cam.y) > SNAP_DIST) return cam.snapTo(wx, wy);
    // Exponential smoothing, framed in dt so the feel doesn't change with the
    // frame rate (a plain lerp per frame would be faster on a 144Hz screen).
    const k = 1 - Math.exp((-FOLLOW_RATE * dt) / 1000);
    cam.x += (wx - cam.x) * k;
    cam.y += (wy - cam.y) * k;
    clamp();
  };

  // World -> canvas. Everything drawn after this is in world units.
  cam.applyTo = (c) => c.setTransform(
    cam.zoom, 0, 0, cam.zoom,
    VIEW_W / 2 - cam.x * cam.zoom,
    VIEW_H / 2 - cam.y * cam.zoom,
  );

  // Projections for the two things that must NOT scale with the zoom: screen-
  // space UI (hotspot prompts, speech bubbles) and the click hit test.
  cam.toView = (wx, wy) => ({
    x: (wx - cam.x) * cam.zoom + VIEW_W / 2,
    y: (wy - cam.y) * cam.zoom + VIEW_H / 2,
  });
  cam.toWorld = (vx, vy) => ({
    x: (vx - VIEW_W / 2) / cam.zoom + cam.x,
    y: (vy - VIEW_H / 2) / cam.zoom + cam.y,
  });

  clamp();
  return cam;
}
