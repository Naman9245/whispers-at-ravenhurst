// Pure drawing functions for the mansion board. No React, no state — give it a
// 2D context and it paints the board at internal resolution (BOARD_W x BOARD_H).
import {
  PALETTE as P, GEO, COLS, ROWS, ROOMS, CONNECTIONS, roomRect, DOOR_HALF, BOARD_W, BOARD_H,
} from "./boardData.js";
import { getBoardLayers } from "./boardLayers.js";
import { SEARCH_MS } from "@shared/constants.js";
import { objectsIn } from "@shared/roomObjects.js";
import { objectImg, blitPixel } from "./objectSprites.js";

// ---- low-level helpers -------------------------------------------------
const rect = (c, x, y, w, h, fill, stroke, sw = 1) => {
  if (fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = sw; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
};
const ellipse = (c, cx, cy, rx, ry, fill) => {
  c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = fill; c.fill();
};
// deterministic pseudo-random so book spines etc. stay stable across frames
const seeded = (s) => { let x = Math.sin(s) * 10000; return () => { x = Math.sin(x) * 10000; return x - Math.floor(x); }; };

// ---- furniture ---------------------------------------------------------
function bookshelf(c, x, y, w, h) {
  rect(c, x, y, w, h, P.woodDk, P.wood, 2);
  const shelves = 3, slot = (h - 12) / shelves, spineH = Math.max(4, slot - 6);
  const cols = ["#783430", "#3c5a6e", "#967832", "#466e50", "#6e5078"];
  for (let i = 0; i < shelves; i++) {
    const sy = y + 6 + i * slot;
    rect(c, x + 4, sy, w - 8, Math.max(3, slot - 4), "#342822");
    const rnd = seeded(x + y + i * 7);
    let bx = x + 6;
    while (bx < x + w - 8) {
      const bw = 5 + Math.floor(rnd() * 5);
      rect(c, bx, sy + 2, bw - 1, spineH, cols[Math.floor(rnd() * cols.length)]);
      bx += bw;
    }
  }
}
function table(c, x, y, w, h) {
  rect(c, x, y, w, h, P.wood, P.woodDk, 2);
  rect(c, x + 4, y + 4, w - 8, h - 8, P.woodLt);
  rect(c, x + 4, y + 4, w - 8, 4, "#a06e46");
}
function rug(c, x, y, w, h, col) {
  rect(c, x, y, w, h, col);
  c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = 2;
  c.strokeRect(x + 5, y + 5, w - 10, h - 10);
}
function fireplace(c, x, y, w, h) {
  rect(c, x, y, w, h, "#463e3a", "#28221e", 2);
  rect(c, x + w * 0.18, y + h * 0.3, w * 0.64, h * 0.6, "#1c1614");
  const fx = x + w * 0.3, by = y + h * 0.85;
  c.fillStyle = P.fire;
  c.beginPath(); c.moveTo(fx, by); c.lineTo(fx + w * 0.18, y + h * 0.4); c.lineTo(fx + w * 0.36, by); c.fill();
  c.fillStyle = P.amberLt;
  c.beginPath(); c.moveTo(fx + w * 0.08, by); c.lineTo(fx + w * 0.18, y + h * 0.55); c.lineTo(fx + w * 0.28, by); c.fill();
}
function lamp(c, x, y) {
  const g = c.createRadialGradient(x, y, 2, x, y, 34);
  g.addColorStop(0, "rgba(255,214,120,0.55)"); g.addColorStop(1, "rgba(255,214,120,0)");
  c.fillStyle = g; c.beginPath(); c.arc(x, y, 34, 0, Math.PI * 2); c.fill();
  ellipse(c, x, y, 9, 9, P.amber);
}
function plant(c, x, y, s = 26) {
  rect(c, x + s * 0.28, y + s * 0.6, s * 0.44, s * 0.4, "#785030");
  ellipse(c, x + s / 2, y + s * 0.34, s * 0.5, s * 0.34, P.green);
}
function fridge(c, x, y, w, h) {
  rect(c, x, y, w, h, "#b4bcc4", "#788088", 2);
  rect(c, x + w - 8, y + 8, 4, h * 0.4, "#788088");
}
function stove(c, x, y, w, h) {
  rect(c, x, y, w, h, "#5a6068", "#32383e", 2);
  ellipse(c, x + w * 0.3, y + h * 0.35, 7, 7, "#282c30");
  ellipse(c, x + w * 0.7, y + h * 0.35, 7, 7, "#282c30");
}

// ---- per-room interiors ------------------------------------------------
// Every room now paints from shared/roomObjects.js — the rect that is drawn IS
// the rect that blocks, so art and collision can never disagree. The old
// hardcoded per-room switch (with its own literal coordinates, kept in visual
// sync by hand) is gone.
function decorate(c, id, x, y) {
  drawFromObjects(c, id, x, y);
}

// ---- object-table renderer (migrated rooms) ----------------------------
// Paints a room's furniture straight from shared/roomObjects.js. `kind` picks
// the primitive; the rect IS the collision box, so what you see is what blocks.
function shadowFor(c, ax, ay, aw, ah) {
  c.save();
  // Directional cast — light comes from the top-left in every room, and keeping
  // that consistent across the board is most of what sells volume.
  c.fillStyle = "rgba(0,0,0,0.30)";
  c.fillRect(ax + 5, ay + 5, aw, ah);
  // Contact shadow: radial falloff, densest where the piece meets the floor.
  const cx = ax + aw / 2, cy = ay + ah + 1, rx = aw * 0.60, ry = 8;
  const g = c.createRadialGradient(cx, cy, 1, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, "rgba(0,0,0,0.40)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.save();
  c.translate(cx, cy); c.scale(1, ry / Math.max(rx, ry)); c.translate(-cx, -cy);
  c.beginPath(); c.arc(cx, cy, Math.max(rx, ry), 0, Math.PI * 2); c.fill();
  c.restore();
  c.restore();
}
function painting(c, ax, ay, aw, ah) {
  rect(c, ax, ay, aw, ah, "#2e2440", P.wood, 2);
  rect(c, ax + 4, ay + 4, aw - 8, ah - 8, "#4a3a5c");
  ellipse(c, ax + aw / 2, ay + ah * 0.42, aw * 0.16, ah * 0.2, "#8c7a9e");
}
function armchair(c, ax, ay, aw, ah) {
  rect(c, ax, ay, aw, ah, "#783c3c", "#502828", 2);
  rect(c, ax + 3, ay + 3, aw - 6, ah * 0.42, "#96504e");   // back cushion
  rect(c, ax + 2, ay + ah * 0.5, aw - 4, ah * 0.42, "#8a4646"); // seat
}
// A long low bench: slatted seat + two legs. Reads as garden furniture.
function bench(c, ax, ay, aw, ah) {
  rect(c, ax, ay, aw, ah, "#785a3c", "#503c28", 2);
  for (let i = 1; i < 3; i++) {
    const sy = ay + (ah / 3) * i;
    c.strokeStyle = "rgba(0,0,0,0.28)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(ax + 3, sy); c.lineTo(ax + aw - 3, sy); c.stroke();
  }
  rect(c, ax + 5, ay + ah - 3, 6, 5, "#503c28");
  rect(c, ax + aw - 11, ay + ah - 3, 6, 5, "#503c28");
}
// Glazing: pale panes behind dark mullions, with a cool sky wash.
function windowPane(c, ax, ay, aw, ah) {
  rect(c, ax, ay, aw, ah, P.glass, "#5a8c96", 2);
  const g = c.createLinearGradient(ax, ay, ax, ay + ah);
  g.addColorStop(0, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(140,196,214,0)");
  c.fillStyle = g; c.fillRect(ax + 2, ay + 2, aw - 4, ah - 4);
  c.strokeStyle = "#6ea0aa"; c.lineWidth = 1;
  for (let gx = ax + 26; gx < ax + aw - 6; gx += 26) {
    c.beginPath(); c.moveTo(gx, ay + 2); c.lineTo(gx, ay + ah - 2); c.stroke();
  }
}
// Dining chair seen from above: seat square with a back rail on one edge.
function diningChair(c, ax, ay, aw, ah) {
  rect(c, ax, ay, aw, ah, P.woodDk, "#32200f", 1);
  rect(c, ax + 2, ay + 2, aw - 4, Math.max(3, ah * 0.28), "#7a5230");
}
function drawFromObjects(c, roomId, ox, oy) {
  for (const o of objectsIn(roomId)) {
    const ax = ox + o.x, ay = oy + o.y;
    if (o.solid) shadowFor(c, ax, ay, o.w, o.h);
    // Optional PNG art wins when present; the procedural renderer below is the
    // permanent fallback (and the loading state). The rect stays the collision
    // box either way — a tall sprite may overhang it via a negative offset.
    const img = o.sprite ? objectImg(o.sprite) : null;
    if (img) {
      blitPixel(c, img,
        ax + (o.spriteOffsetX || 0), ay + (o.spriteOffsetY || 0),
        o.spriteW ?? o.w, o.spriteH ?? o.h);
      continue;
    }
    switch (o.kind) {
      // `rug` honours the object's own colour so the maroon P.rug the legacy
      // rooms used is reachable from the migrated path (it was hardcoded to
      // P.floorDk, which silently flattened every migrated rug to floor colour).
      case "rug":        rug(c, ax, ay, o.w, o.h, o.color || P.rug); break;
      case "bookshelf":  bookshelf(c, ax, ay, o.w, o.h); break;
      case "desk":       table(c, ax, ay, o.w, o.h); break;
      case "counter":    rect(c, ax, ay, o.w, o.h, "#96785a", "#645040", 2); break;
      case "armchair":   armchair(c, ax, ay, o.w, o.h); break;
      case "sofa":       armchair(c, ax, ay, o.w, o.h); break;
      case "chair":      diningChair(c, ax, ay, o.w, o.h); break;
      case "bench":      bench(c, ax, ay, o.w, o.h); break;
      case "window":     windowPane(c, ax, ay, o.w, o.h); break;
      case "fireplace":  fireplace(c, ax, ay, o.w, o.h); break;
      case "painting":   painting(c, ax, ay, o.w, o.h); break;
      case "lamp":       lamp(c, ax + o.w / 2, ay + o.h / 2); break;
      case "plant":      plant(c, ax, ay, Math.max(o.w, o.h)); break;
      case "stove":      stove(c, ax, ay, o.w, o.h); break;
      case "fridge":     fridge(c, ax, ay, o.w, o.h); break;
      default:           rect(c, ax, ay, o.w, o.h, P.wood, P.woodDk, 2); break;
    }
  }
}

// ---- doors: each room opens into the corridor on its inner edge ---------
function drawDoors(c) {
  const corrY0 = ROWS[0] + GEO.roomH;
  const corrY1 = ROWS[1];
  const W = DOOR_HALF * 2;   // visible gap == collision gap (no clipping beside doors)
  for (const id of Object.keys(ROOMS)) {
    const { col, row } = ROOMS[id];
    const cx = COLS[col] + GEO.roomW / 2;
    const edgeY = row === 0 ? corrY0 : corrY1;
    // carve the doorway through the brick wall into the corridor
    rect(c, cx - W / 2, edgeY - 8, W, 16, P.hall);
    // warm threshold line on the room side
    c.strokeStyle = "#3c281e"; c.lineWidth = 2;
    const ty = row === 0 ? edgeY - 8 : edgeY + 8;
    c.beginPath(); c.moveTo(cx - W / 2, ty); c.lineTo(cx + W / 2, ty); c.stroke();
  }
}

// ---- per-room identity --------------------------------------------------
// Each room gets its own floor material, back-wall colour and mood tint. This is
// what stops six identical green boxes reading as one undifferentiated map.
const ROOM_STYLE = {
  study:        { floor: "plank",   wall: "#4a3646", tint: "rgba(150,100,50,0.10)" },
  dining:       { floor: "parquet", wall: "#523a44", tint: "rgba(160,105,55,0.10)" },
  lounge:       { floor: "parquet", wall: "#4e3442", tint: "rgba(170,80,65,0.11)" },
  library:      { floor: "plank",   wall: "#46323c", tint: "rgba(150,80,45,0.12)" },
  kitchen:      { floor: "tile",    wall: "#3e4450", tint: "rgba(80,120,145,0.10)" },
  conservatory: { floor: "stone",   wall: "#3a4a4a", tint: "rgba(90,140,130,0.10)" },
};
const styleOf = (id) => ROOM_STYLE[id] || ROOM_STYLE.study;

// ---- material tiles -----------------------------------------------------
// Small canvases turned into repeating patterns. Built once, used inside the
// static bake — so a whole floor costs ONE fillRect instead of a stroke loop.
const tileCache = new Map();
function tileCanvas(kind) {
  if (tileCache.has(kind)) return tileCache.get(kind);
  const t = document.createElement("canvas");
  t.width = t.height = 32;
  const g = t.getContext("2d");
  if (kind === "tile") {
    g.fillStyle = "#33474b"; g.fillRect(0, 0, 32, 32);
    g.fillStyle = "#2b3c40"; g.fillRect(0, 0, 16, 16); g.fillRect(16, 16, 16, 16);
    g.strokeStyle = "rgba(0,0,0,0.18)"; g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, 31, 31);
  } else if (kind === "stone") {
    g.fillStyle = "#3b4a44"; g.fillRect(0, 0, 32, 32);
    g.strokeStyle = "rgba(0,0,0,0.22)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, 16); g.lineTo(32, 16); g.stroke();
    g.beginPath(); g.moveTo(16, 0); g.lineTo(16, 16); g.stroke();
    g.beginPath(); g.moveTo(6, 16); g.lineTo(6, 32); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.03)"; g.fillRect(1, 1, 14, 14);
  } else if (kind === "parquet") {
    g.fillStyle = "#33463f"; g.fillRect(0, 0, 32, 32);
    g.fillStyle = "#2d3f39";
    for (let i = 0; i < 4; i++) g.fillRect(0, i * 8, 16, 6);
    for (let i = 0; i < 4; i++) g.fillRect(16 + 0, i * 8 + 4, 16, 6);
    g.strokeStyle = "rgba(0,0,0,0.16)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(16, 0); g.lineTo(16, 32); g.stroke();
  } else {   // plank
    g.fillStyle = "#2e4a44"; g.fillRect(0, 0, 32, 32);
    g.strokeStyle = "rgba(0,0,0,0.20)"; g.lineWidth = 1;
    for (let yy = 8; yy < 32; yy += 8) { g.beginPath(); g.moveTo(0, yy); g.lineTo(32, yy); g.stroke(); }
    g.fillStyle = "rgba(255,255,255,0.030)"; g.fillRect(0, 1, 32, 2);
    g.fillStyle = "rgba(0,0,0,0.10)"; g.fillRect(11, 0, 1, 8); g.fillRect(24, 8, 1, 8);
  }
  tileCache.set(kind, t);
  return t;
}
function brickTile() {
  if (tileCache.has("brick")) return tileCache.get("brick");
  const t = document.createElement("canvas");
  t.width = 32; t.height = 16;
  const g = t.getContext("2d");
  g.fillStyle = P.wall; g.fillRect(0, 0, 32, 16);
  g.strokeStyle = "rgba(92,62,56,0.55)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, 8.5); g.lineTo(32, 8.5); g.stroke();
  g.beginPath(); g.moveTo(8.5, 0); g.lineTo(8.5, 8); g.stroke();
  g.beginPath(); g.moveTo(24.5, 8); g.lineTo(24.5, 16); g.stroke();
  g.fillStyle = "rgba(255,255,255,0.025)"; g.fillRect(0, 0, 32, 1);
  tileCache.set("brick", t);
  return t;
}
const fillWith = (c, canvas, x, y, w, h) => {
  c.save();
  const pat = c.createPattern(canvas, "repeat");
  c.translate(x, y);
  c.fillStyle = pat;
  c.fillRect(0, 0, w, h);
  c.restore();
};

// ---- the back wall ------------------------------------------------------
// A short papered band across the TOP of each room: wallpaper, a wainscot line
// and a skirting strip. This is the single biggest "flat floor-plan -> actual
// room" change, because it gives the box a visible far wall to hang art on.
//
// ⚠️ COSMETIC ONLY — it must never become solid. The walkable interior is
// roomInterior() (inset WALL_INSET=16); thickening the drawn wall past that
// would put the art and the collision box back out of sync, which is the exact
// class of bug shared/roomObjects.js exists to prevent. The feet can stand on
// the band's lower pixels; that is the normal top-down concession.
const WALL_BAND_H = 22;
function wallBand(c, id, x, y, w) {
  const st = styleOf(id);
  const isBottomRow = ROOMS[id].row === 1;
  const cx = x + w / 2;
  // Row-1 rooms have their doorway in this very wall — leave an arch-sized gap.
  const gapL = isBottomRow ? cx - DOOR_HALF : null;
  const gapR = isBottomRow ? cx + DOOR_HALF : null;
  const segments = isBottomRow ? [[x, gapL], [gapR, x + w]] : [[x, x + w]];
  for (const [sx, ex] of segments) {
    const sw = ex - sx;
    if (sw <= 0) continue;
    rect(c, sx, y, sw, WALL_BAND_H, st.wall);
    // vertical shading so the wall doesn't read as a flat stripe
    const g = c.createLinearGradient(0, y, 0, y + WALL_BAND_H);
    g.addColorStop(0, "rgba(0,0,0,0.30)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(sx, y, sw, WALL_BAND_H);
    rect(c, sx, y + WALL_BAND_H - 5, sw, 5, "rgba(0,0,0,0.28)");     // skirting
    c.strokeStyle = "rgba(255,255,255,0.10)"; c.lineWidth = 1;        // wainscot
    c.beginPath(); c.moveTo(sx, y + WALL_BAND_H - 5.5); c.lineTo(ex, y + WALL_BAND_H - 5.5); c.stroke();
  }
}

// ---- lighting -----------------------------------------------------------
// The light list is DERIVED from the furniture table, so migrating a room lights
// it automatically and a lamp can never drift away from its glow.
const LIGHT_KINDS = {
  lamp:       { r: 150, rgb: "255,214,120", a: 1.00 },
  fireplace:  { r: 165, rgb: "255,150,72",  a: 1.00 },
  stove:      { r: 90,  rgb: "255,182,120", a: 0.55 },
  window:     { r: 175, rgb: "176,216,240", a: 0.85 },   // cool daylight, not amber
};
// Lights are grouped BY ROOM so the glow can be clipped to the room that owns
// it. Unclipped, a lamp near a wall erased darkness straight through the brick
// and out onto the backdrop — rooms bled haloes into the void around them.
export function boardLights() {
  const byRoom = [];
  for (const id of Object.keys(ROOMS)) {
    const r = roomRect(id);
    const lights = [];
    for (const o of objectsIn(id)) {
      const L = LIGHT_KINDS[o.kind];
      if (!L) continue;
      lights.push({ x: r.x + o.x + o.w / 2, y: r.y + o.y + o.h / 2, ...L, kind: o.kind });
    }
    if (lights.length) byRoom.push({ id, rect: r, lights });
  }
  return byRoom;
}
export const flatLights = () => boardLights().flatMap((g) => g.lights.map((L) => ({ ...L, room: g.rect })));

// Ambient darkness with light punched OUT of it, then warm colour added back.
// `destination-out` is what makes the pools soft with zero per-pixel JS.
function applyLighting(c, groups) {
  const mask = document.createElement("canvas");
  mask.width = BOARD_W; mask.height = BOARD_H;
  const m = mask.getContext("2d");
  // Ambient dim. Kept LIGHT on purpose: this is a game where the player has to
  // read furniture, hotspot magnifiers and their own detective. A heavier wash
  // looked moodier in a screenshot and was genuinely unplayable in motion.
  m.fillStyle = "rgba(8,5,14,0.30)";
  m.fillRect(0, 0, BOARD_W, BOARD_H);
  // The corridor sits a touch darker so the lit rooms read as the stage.
  m.fillStyle = "rgba(8,5,14,0.16)";
  m.fillRect(GEO.margin, ROWS[0] + GEO.roomH, BOARD_W - GEO.margin * 2, GEO.hall);

  m.globalCompositeOperation = "destination-out";
  for (const grp of groups) {
    m.save();
    // Clip to the room (plus its brick frame) so light never crosses a wall.
    m.beginPath();
    m.rect(grp.rect.x - 6, grp.rect.y - 6, grp.rect.w + 12, grp.rect.h + 12);
    m.clip();
    for (const L of grp.lights) {
      const g = m.createRadialGradient(L.x, L.y, 2, L.x, L.y, L.r);
      g.addColorStop(0, `rgba(0,0,0,${L.a})`);
      g.addColorStop(0.5, `rgba(0,0,0,${L.a * 0.55})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      m.fillStyle = g;
      m.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    m.restore();
  }
  m.globalCompositeOperation = "source-over";
  c.drawImage(mask, 0, 0);

  // Add the warm colour the mask could only subtract — same clip.
  c.save();
  c.globalCompositeOperation = "lighter";
  for (const grp of groups) {
    c.save();
    c.beginPath();
    c.rect(grp.rect.x, grp.rect.y, grp.rect.w, grp.rect.h);
    c.clip();
    for (const L of grp.lights) {
      const rr = L.r * 0.85;
      const g = c.createRadialGradient(L.x, L.y, 2, L.x, L.y, rr);
      g.addColorStop(0, `rgba(${L.rgb},0.16)`);
      g.addColorStop(1, `rgba(${L.rgb},0)`);
      c.fillStyle = g;
      c.fillRect(L.x - rr, L.y - rr, rr * 2, rr * 2);
    }
    c.restore();
  }
  c.restore();
}

// ---- STATIC bake --------------------------------------------------------
// Everything here is identical on every frame for every player, so it is painted
// ONCE into an offscreen canvas (see boardLayers.js) and blitted thereafter.
// That is what makes the detail above affordable: before this, the board redrew
// ~168 stroked lines and allocated 5 radial gradients 60 times a second.
export function paintStatic(c) {
  rect(c, 0, 0, BOARD_W, BOARD_H, P.bg);

  const corrY0 = ROWS[0] + GEO.roomH;
  const corrH = GEO.hall;
  const corrX = GEO.margin;
  const corrW = BOARD_W - GEO.margin * 2;
  rect(c, corrX, corrY0, corrW, corrH, P.hall);
  rect(c, corrX, corrY0 + corrH / 2 - 18, corrW, 36, "rgba(92,60,102,0.5)");
  c.strokeStyle = P.hallEdge; c.lineWidth = 2;
  c.beginPath(); c.moveTo(corrX, corrY0); c.lineTo(corrX + corrW, corrY0); c.stroke();
  c.beginPath(); c.moveTo(corrX, corrY0 + corrH); c.lineTo(corrX + corrW, corrY0 + corrH); c.stroke();

  for (const id of Object.keys(ROOMS)) {
    const { x, y, w, h } = roomRect(id);
    const st = styleOf(id);
    fillWith(c, brickTile(), x - 6, y - 6, w + 12, h + 12);   // brick frame
    fillWith(c, tileCanvas(st.floor), x, y, w, h);            // floor material
    wallBand(c, id, x, y, w);
    decorate(c, id, x, y);
    // per-room mood tint
    c.save();
    c.globalCompositeOperation = "multiply";
    c.fillStyle = st.tint; c.fillRect(x, y, w, h);
    c.restore();
    rect(c, x, y, w, h, null, P.floorDk, 3);
  }

  drawDoors(c);
  applyLighting(c, boardLights());

  // Board-wide vignette — same two-layer recipe as the menu's .mm-scrim.
  c.save();
  const vg = c.createRadialGradient(BOARD_W / 2, BOARD_H * 0.42, BOARD_H * 0.28,
                                    BOARD_W / 2, BOARD_H * 0.42, BOARD_W * 0.62);
  vg.addColorStop(0, "rgba(21,14,30,0)");
  vg.addColorStop(1, "rgba(21,14,30,0.30)");
  c.fillStyle = vg; c.fillRect(0, 0, BOARD_W, BOARD_H);
  c.restore();

  // Labels last so nothing dims them.
  c.font = "700 22px 'Courier New', monospace";
  c.textBaseline = "alphabetic";
  for (const id of Object.keys(ROOMS)) {
    const { x, y, w, h } = roomRect(id);
    const label = ROOMS[id].label;
    const tw = c.measureText(label).width;
    const lx = x + w / 2 - tw / 2, ly = y + h - 22;
    rect(c, lx - 12, ly - 22, tw + 24, 30, "rgba(20,14,26,0.92)", "#000", 2);
    c.fillStyle = P.cream; c.fillText(label, lx, ly);
  }
}

// ---- per-frame flicker --------------------------------------------------
// ONE prerendered glow sprite, blitted additively per light. Replaces the 5
// createRadialGradient allocations the old renderer did every single frame,
// while adding live fire flicker on top.
let glowSprite = null;
function getGlow() {
  if (glowSprite) return glowSprite;
  const s = document.createElement("canvas");
  s.width = s.height = 128;
  const g = s.getContext("2d");
  const rg = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  rg.addColorStop(0, "rgba(255,255,255,0.9)");
  rg.addColorStop(0.5, "rgba(255,255,255,0.28)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  glowSprite = s;
  return s;
}
function drawFlicker(c, groups, t) {
  const glow = getGlow();
  c.save();
  c.globalCompositeOperation = "lighter";
  let i = 0;
  for (const grp of groups) {
    c.save();
    c.beginPath();
    c.rect(grp.rect.x, grp.rect.y, grp.rect.w, grp.rect.h);
    c.clip();
    for (const L of grp.lights) {
      i++;
      if (L.kind === "window") continue;               // daylight doesn't flicker
      const wob = L.kind === "fireplace"
        ? 0.10 + 0.055 * Math.sin(t / 130 + i) + 0.03 * Math.sin(t / 47 + i * 2)
        : 0.05 + 0.015 * Math.sin(t / 900 + i);
      const r = L.r * 0.55;
      c.globalAlpha = Math.max(0, wob);
      c.drawImage(glow, L.x - r, L.y - r, r * 2, r * 2);
    }
    c.restore();
  }
  c.restore();
}

// ---- public: paint the whole board ------------------------------------
// Blits the cached static layer, then paints only what genuinely changes:
// firelight flicker and the player-specific room highlights.
export function drawBoard(c, { current = null, reachable = [], flicker = true } = {}) {
  const { bg } = getBoardLayers(paintStatic);
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(bg, 0, 0);
  c.restore();

  if (flicker) drawFlicker(c, boardLights(), Date.now());

  // NOTE: the room you are standing in is deliberately NOT highlighted. It used
  // to get a teal wash plus a glowing border, which fought the per-room lighting
  // and tinted every piece of furniture in the room — and it was redundant, since
  // the HUD already reads "YOU: Holmes · DINING HALL". Keeping the board clean
  // lets the lamps and hearths do the work of telling you where you are.
  for (const id of Object.keys(ROOMS)) {
    const { x, y, w, h } = roomRect(id);
    if (id !== current && reachable.includes(id)) {
      c.save();
      c.strokeStyle = P.amberLt; c.lineWidth = 3;
      c.setLineDash([10, 8]); c.lineDashOffset = -(Date.now() / 40) % 18;
      c.strokeRect(x - 4, y - 4, w + 8, h + 8);
      c.restore();
    }
  }
}

// ---- hotspots (Phase 2.2): subtle search indicators over furniture ----------
function magnifier(c, px, py, scale, alpha) {
  c.save();
  c.globalAlpha = alpha;
  c.translate(px, py);
  c.scale(scale, scale);
  c.fillStyle = "rgba(255,214,120,0.22)";
  c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.fill();           // lens tint
  c.strokeStyle = P.amberLt; c.lineWidth = 3; c.lineCap = "round";
  c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.stroke();          // lens rim
  c.beginPath(); c.moveTo(6, 6); c.lineTo(12, 12); c.stroke();        // handle
  c.restore();
}
function checkMark(c, px, py, alpha) {
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = "#6ed68a"; c.lineWidth = 3; c.lineCap = "round"; c.lineJoin = "round";
  c.beginPath(); c.moveTo(px - 6, py); c.lineTo(px - 1, py + 6); c.lineTo(px + 7, py - 6); c.stroke();
  c.restore();
}

// ---- depth sorting -----------------------------------------------------
// Lets the detective stand BEHIND tall furniture instead of always on top of it.
//
// Rather than keeping a second offscreen layer of re-drawn furniture, this blits
// the object's sub-rect straight out of the already-baked `bg`. That matters: a
// separately-painted occluder would miss the baked lighting, shadows and room
// tint, so an occluding bookshelf would visibly glow brighter than the identical
// shelf beside it. Taking the pixels from `bg` is consistent for free, and needs
// no extra canvas.
//
// Cost is a handful of small drawImage calls per frame — usually zero, since we
// only touch `tall` objects in the character's own room whose bounds actually
// intersect the sprite.
const CH_HALF_W = 50, CH_TOP = 76, CH_BOT = 24;   // sprite box around the FEET

export function drawOccluders(c, roomId, feetX, feetY) {
  if (!roomId) return;
  const { bg } = getBoardLayers(paintStatic);
  const r = roomRect(roomId);
  const cl = feetX - CH_HALF_W, cr = feetX + CH_HALF_W;
  const ct = feetY - CH_TOP, cb = feetY + CH_BOT;
  for (const o of objectsIn(roomId)) {
    if (!o.tall) continue;
    const ax = r.x + o.x, ay = r.y + o.y, bottom = ay + o.h;
    // A piece only occludes when it extends BELOW the feet — i.e. the detective
    // is standing further back than the object's front face.
    if (bottom <= feetY) continue;
    if (ax > cr || ax + o.w < cl || ay > cb || bottom < ct) continue;   // no overlap
    // Straight from the baked layer, so the patch keeps its lighting and tint.
    c.drawImage(bg, ax, ay, o.w, o.h, ax, ay, o.w, o.h);
  }
}

// Draw the current room's hotspot indicators. `hotspots` are normalized (0–1)
// within the room; `examined` is a Set of examined ids; `activeId` is the spot the
// player is standing next to (scaled up + "Press E" prompt).
export function drawHotspots(c, roomId, hotspots, examined, activeId) {
  if (!roomId || !hotspots) return;
  const r = roomRect(roomId);
  c.textBaseline = "alphabetic";
  for (const h of hotspots) {
    const px = r.x + h.x * r.w;
    const py = r.y + h.y * r.h;
    if (examined.has(h.id)) { checkMark(c, px, py, 0.35); continue; }
    const active = h.id === activeId;
    const pulse = 0.55 + 0.22 * Math.sin(Date.now() / 320);
    magnifier(c, px, py, active ? 1.25 : 1, active ? 0.95 : pulse);
    if (active) {
      // 22px to match the room-label tags. The board is drawn at 1472x860 and
      // then CSS-scaled DOWN to fit the viewport, so on a typical 1600x900
      // screen the old 15px landed at roughly 12px on-screen — legible in a
      // screenshot, a squint in motion.
      c.font = "700 22px 'Courier New', monospace";
      // The key cap is drawn as its own boxed glyph, and the separator is a
      // plain ASCII dot: an em dash (—) is NOT in Courier New's canvas glyph
      // set here and rendered as a blank gap, so the prompt read "Press E   The
      // Wine Cabinet" with a hole in the middle.
      const key = "E";
      const label = `${h.name}`;
      const gap = 10, keyW = 26, keyH = 26;
      const tw = c.measureText(label).width;
      const total = keyW + gap + tw;
      const lx = px - total / 2, ly = py - 26;
      // Backing plate
      rect(c, lx - 12, ly - 22, total + 24, 34, "rgba(16,11,22,0.97)", P.amberLt, 2);
      // Key cap
      rect(c, lx, ly - 19, keyW, keyH, "rgba(240,184,92,0.20)", P.amberLt, 2);
      c.fillStyle = P.amberLt;
      const kw = c.measureText(key).width;
      c.fillText(key, lx + (keyW - kw) / 2, ly);
      // Label
      c.fillStyle = P.cream;
      c.fillText(label, lx + keyW + gap, ly);
    }
  }
}

// ---- searching state (Phase 2.3b/c): the 2.5s "examining…" overlay -----------
// A cute white comic speech-cloud above the character (white fill, navy border,
// soft shadow, down-tail, bouncing charcoal dots, gentle bob, puff in/out) plus a
// glow on the hotspot being examined. (cx,cy) = feet; (hx,hy) = hotspot pixel.
const SEARCH_DUR = SEARCH_MS; // shared with App.jsx's search timeout (puff-out timing)

// One closed path: a rounded-rect cloud body with a small downward tail at centre,
// so a single fill (with shadow) + single stroke (border) render cleanly.
function bubblePath(c, w, h, r) {
  const rx = w / 2, ry = h / 2;
  c.beginPath();
  c.moveTo(-rx + r, -ry);
  c.lineTo(rx - r, -ry);
  c.quadraticCurveTo(rx, -ry, rx, -ry + r);
  c.lineTo(rx, ry - r);
  c.quadraticCurveTo(rx, ry, rx - r, ry);
  c.lineTo(7, ry);
  c.lineTo(0, ry + 10);   // tail tip toward the character
  c.lineTo(-7, ry);
  c.lineTo(-rx + r, ry);
  c.quadraticCurveTo(-rx, ry, -rx, ry - r);
  c.lineTo(-rx, -ry + r);
  c.quadraticCurveTo(-rx, -ry, -rx + r, -ry);
  c.closePath();
}

export function drawSearching(c, cx, cy, hx, hy, startTime) {
  const now = Date.now();
  const elapsed = startTime ? now - startTime : SEARCH_DUR / 2;

  // Puff entrance (0.8→1 over 200ms, ease-out) and exit (1→0 over the last 200ms).
  let scale = 1;
  if (elapsed < 200) { const t = elapsed / 200; scale = 0.8 + 0.2 * (1 - (1 - t) * (1 - t)); }
  else if (elapsed > SEARCH_DUR - 200) { scale = Math.max(0, 1 - (elapsed - (SEARCH_DUR - 200)) / 200); }

  // Glow ring on the hotspot being examined.
  const pulse = 0.5 + 0.5 * Math.sin(now / 200);
  c.save();
  c.globalAlpha = 0.4 + 0.35 * pulse;
  c.strokeStyle = P.amberLt; c.lineWidth = 3; c.shadowColor = P.amberLt; c.shadowBlur = 14;
  c.beginPath(); c.arc(hx, hy, 12 + 3 * pulse, 0, Math.PI * 2); c.stroke();
  c.restore();

  if (scale <= 0.02) return; // bubble fully puffed out

  const bob = Math.sin(now / 239) * 3; // gentle ~3px / 1.5s float
  c.save();
  c.translate(cx, cy - 90 + bob);
  c.scale(scale, scale);

  // white cloud body + tail: one path, soft drop shadow under the fill
  c.save();
  c.shadowColor = "rgba(0,0,0,0.3)"; c.shadowBlur = 6; c.shadowOffsetY = 2;
  c.fillStyle = "#faf8f3";
  bubblePath(c, 62, 34, 13);
  c.fill();
  c.restore();
  c.strokeStyle = "#3a3548"; c.lineWidth = 1.5; // subtle navy border
  bubblePath(c, 62, 34, 13);
  c.stroke();

  // three charcoal dots bouncing left→middle→right (classic "thinking")
  c.fillStyle = "#2a2540";
  for (let i = 0; i < 3; i++) {
    const dy = -Math.max(0, Math.sin(now / 170 - i * 0.7)) * 4;
    c.beginPath(); c.arc(-14 + i * 14, dy, 3.2, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}
