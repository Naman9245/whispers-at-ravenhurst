// Optional PNG art for furniture, mirroring the character loader in sprites.js.
//
// The mansion is drawn entirely with Canvas2D primitives today — there is no
// environment art in the repo at all. This module is the slot that lets real
// pixel-art furniture drop in later WITHOUT rewriting the renderer: an object in
// shared/roomObjects.js may name a `sprite`, and drawFromObjects blits it instead
// of running the procedural `kind` renderer.
//
// The procedural path is never removed. It stays as the permanent fallback, the
// loading state, and the graceful degradation for a PNG that fails to decode.
//
// ⚠️ SHIP WITH NO POPULATED `sprite` PATHS until the files actually exist in
// client/public/. A 404 logs a console error, and every .shots e2e suite asserts
// "no console/page errors" — one missing PNG fails four suites at once.
//
// Authoring notes for whoever makes the art (see assets/<char>/metadata.json for
// the exact prompt used on the detectives — matching it keeps the style
// consistent): draw at the object's on-screen size so no resampling happens, use
// the same "low top-down" view as the characters, and give tall pieces a
// negative spriteOffsetY so the art overhangs its floor footprint. The rect in
// roomObjects.js remains the COLLISION box regardless of what the sprite does.
import { ROOM_OBJECTS } from "@shared/roomObjects.js";
import { invalidateBoardLayers } from "./boardLayers.js";

const cache = new Map();   // path -> HTMLImageElement
let loadPromise = null;

function preload(path) {
  if (cache.has(path)) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { cache.set(path, img); resolve(); };
    img.onerror = () => resolve();   // never block the board on a missing frame
    img.src = "/" + path;            // paths are stored without a leading slash
  });
}

// Every distinct sprite path declared across all rooms.
export function declaredSpritePaths() {
  const paths = new Set();
  for (const list of Object.values(ROOM_OBJECTS)) {
    for (const o of list) if (o.sprite) paths.add(o.sprite);
  }
  return [...paths];
}

/**
 * Preload every declared furniture sprite, then invalidate the static board bake
 * exactly once so the freshly-loaded art actually appears.
 *
 * The PROMISE is cached rather than the result — BoardCanvas and menuScene can
 * both mount, and caching the value would let them each kick off a duplicate
 * fetch before the first resolved. Same reasoning as sprites.js.
 */
export function preloadObjectSprites() {
  if (loadPromise) return loadPromise;
  const paths = declaredSpritePaths();
  if (paths.length === 0) {
    loadPromise = Promise.resolve();   // nothing declared: stay fully procedural
    return loadPromise;
  }
  loadPromise = Promise.all(paths.map(preload)).then(() => {
    // The bake happened before these decoded, so it still holds procedural art.
    // This is the ONLY runtime invalidation in the game.
    invalidateBoardLayers();
  });
  return loadPromise;
}

export const objectImg = (path) => cache.get(path);

// Blit without smoothing, restoring the previous setting rather than leaving it
// off globally (Character.draw used to set it and never restore, which is
// harmless with vector furniture and a real trap once furniture is image-based).
export function blitPixel(c, img, dx, dy, dw, dh) {
  const prev = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = false;
  c.drawImage(img, dx, dy, dw, dh);
  c.imageSmoothingEnabled = prev;
}
