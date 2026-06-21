// Pure drawing functions for the mansion board. No React, no state — give it a
// 2D context and it paints the board at internal resolution (BOARD_W x BOARD_H).
import {
  PALETTE as P, GEO, COLS, ROWS, ROOMS, CONNECTIONS, roomRect, DOOR_HALF,
} from "./boardData.js";

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
const chair = (c, x, y, s = 18) => rect(c, x, y, s, s, P.woodDk, "#32200f", 1);
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
function decorate(c, id, x, y, w, h) {
  const cx = x + w / 2, cy = y + h / 2;
  switch (id) {
    case "study":
      rug(c, x + w * 0.18, y + h * 0.30, w * 0.64, h * 0.55, P.floorDk);
      bookshelf(c, x + 10, y + 8, w * 0.5, 40);
      table(c, cx - 55, cy - 18, 110, 56);
      chair(c, cx - 9, cy + 44);
      lamp(c, x + w - 36, y + h - 36);
      break;
    case "dining":
      rug(c, x + w * 0.12, y + h * 0.28, w * 0.76, h * 0.6, P.rug);
      table(c, x + w * 0.18, cy - 30, w * 0.64, 60);
      for (let i = 0; i < 4; i++) {
        chair(c, x + w * 0.2 + i * (w * 0.16), cy - 58);
        chair(c, x + w * 0.2 + i * (w * 0.16), cy + 34);
      }
      lamp(c, x + 30, y + 26); lamp(c, x + w - 30, y + 26);
      break;
    case "lounge":
      rug(c, x + w * 0.15, y + h * 0.35, w * 0.7, h * 0.5, P.rug);
      fireplace(c, cx - 45, y + 14, 90, 56);
      rect(c, x + w * 0.2, y + h * 0.62, w * 0.6, 34, "#783c3c", "#502828", 2);
      lamp(c, x + w - 34, y + h - 34); plant(c, x + 16, y + h - 48);
      break;
    case "library":
      rug(c, x + w * 0.16, y + h * 0.34, w * 0.68, h * 0.52, P.rug);
      bookshelf(c, x + 8, y + 8, w * 0.42, 44);
      bookshelf(c, x + w - 8 - w * 0.42, y + 8, w * 0.42, 44);
      fireplace(c, cx - 40, cy - 6, 80, 50);
      rect(c, x + w * 0.22, y + h * 0.72, w * 0.3, 30, "#783c3c", "#502828", 2);
      lamp(c, x + 30, y + h - 32);
      break;
    case "kitchen":
      rug(c, x + w * 0.1, y + h * 0.3, w * 0.8, h * 0.6, P.floorDk);
      stove(c, cx - 20, cy - 10, 70, 50);
      fridge(c, x + w - 70, cy - 14, 44, 70);
      rect(c, x + 16, cy - 6, w * 0.34, 44, "#96785a", "#645040", 2);
      for (let i = 0; i < 3; i++) {
        c.strokeStyle = "#969aa0"; c.lineWidth = 2;
        c.beginPath(); c.arc(cx - 22 + i * 22, y + 24, 8, 0, Math.PI * 2); c.stroke();
      }
      break;
    case "conservatory":
      rect(c, x + 8, y + 8, w - 16, h * 0.4, P.glass, "#5a8c96", 2);
      c.strokeStyle = "#6ea0aa"; c.lineWidth = 1;
      for (let gx = x + 48; gx < x + w - 16; gx += 40) {
        c.beginPath(); c.moveTo(gx, y + 8); c.lineTo(gx, y + 8 + h * 0.4); c.stroke();
      }
      rect(c, x + w * 0.3, y + h * 0.55, w * 0.4, 26, "#785a3c", "#503c28", 2);
      [x + 24, x + w * 0.32, x + w * 0.6, x + w - 50].forEach((px) =>
        plant(c, px, y + h - 50, 30));
      break;
    default: break;
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

// ---- public: paint the whole board ------------------------------------
export function drawBoard(c, { current = null, reachable = [] } = {}) {
  // backdrop
  rect(c, 0, 0, c.canvas.width, c.canvas.height, P.bg);

  // central horizontal corridor (the spine every room connects to)
  const corrY0 = ROWS[0] + GEO.roomH;        // 372
  const corrH = GEO.hall;                     // 116
  const corrX = GEO.margin;
  const corrW = c.canvas.width - GEO.margin * 2;
  rect(c, corrX, corrY0, corrW, corrH, P.hall);
  // corridor runner + edge lines
  rect(c, corrX, corrY0 + corrH / 2 - 18, corrW, 36, "rgba(92,60,102,0.5)");
  c.strokeStyle = P.hallEdge; c.lineWidth = 2;
  c.beginPath(); c.moveTo(corrX, corrY0); c.lineTo(corrX + corrW, corrY0); c.stroke();
  c.beginPath(); c.moveTo(corrX, corrY0 + corrH); c.lineTo(corrX + corrW, corrY0 + corrH); c.stroke();

  // rooms
  for (const id of Object.keys(ROOMS)) {
    const { x, y, w, h } = roomRect(id);
    rect(c, x - 6, y - 6, w + 12, h + 12, P.wall);             // brick frame
    c.strokeStyle = "rgba(92,62,56,0.4)"; c.lineWidth = 1;
    for (let by = y - 6; by < y + h + 6; by += 14) {
      c.beginPath(); c.moveTo(x - 6, by); c.lineTo(x + w + 6, by); c.stroke();
    }
    rect(c, x, y, w, h, P.floor);                              // floor
    c.strokeStyle = "rgba(38,62,57,0.5)"; c.lineWidth = 1;
    for (let ty = y; ty < y + h; ty += 28) {
      c.beginPath(); c.moveTo(x, ty); c.lineTo(x + w, ty); c.stroke();
    }
    decorate(c, id, x, y, w, h);

    if (id === current) {                                     // current room: teal fill + glow
      c.save();
      c.fillStyle = "rgba(111,214,196,0.14)";
      c.fillRect(x, y, w, h);
      c.strokeStyle = P.tealTxt; c.lineWidth = 4;
      c.shadowColor = P.tealTxt; c.shadowBlur = 12;
      c.strokeRect(x - 2, y - 2, w + 4, h + 4);
      c.restore();
    } else if (reachable.includes(id)) {                      // reachable rooms: amber dashes
      c.save();
      c.strokeStyle = P.amberLt; c.lineWidth = 3;
      c.setLineDash([10, 8]); c.lineDashOffset = -(Date.now() / 40) % 18;
      c.strokeRect(x - 4, y - 4, w + 8, h + 8);
      c.restore();
    }

    rect(c, x, y, w, h, null, P.floorDk, 3);                   // floor border on top
  }

  drawDoors(c);

  // room label tags
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
      c.font = "700 15px 'Courier New', monospace";
      const label = `Press E — ${h.name}`;
      const tw = c.measureText(label).width;
      const lx = px - tw / 2, ly = py - 20;
      rect(c, lx - 9, ly - 17, tw + 18, 24, "rgba(20,14,26,0.96)", P.amberLt, 1);
      c.fillStyle = P.cream; c.fillText(label, lx, ly);
    }
  }
}

// ---- searching state (Phase 2.3b): the 2.5s "examining…" overlay -------------
// Glow on the hotspot being searched + a "…/…./….." speech bubble and a pulsing
// magnifier above the character. (cx,cy) = character feet; (hx,hy) = hotspot pixel.
export function drawSearching(c, cx, cy, hx, hy) {
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);

  // glowing ring on the hotspot currently being examined
  c.save();
  c.globalAlpha = 0.45 + 0.35 * pulse;
  c.strokeStyle = P.amberLt; c.lineWidth = 3;
  c.shadowColor = P.amberLt; c.shadowBlur = 14;
  c.beginPath(); c.arc(hx, hy, 13 + 3 * pulse, 0, Math.PI * 2); c.stroke();
  c.restore();

  // speech bubble above the character with cycling dots: "…" → "…." → "….."
  const dots = ".".repeat(3 + (Math.floor(Date.now() / 170) % 3));
  const bw = 64, bh = 30, bx = cx - bw / 2, by = cy - 98;
  rect(c, bx, by, bw, bh, "rgba(20,14,26,0.96)", P.amberLt, 2);
  c.fillStyle = "rgba(20,14,26,0.96)";                       // little tail
  c.beginPath(); c.moveTo(cx - 6, by + bh); c.lineTo(cx + 6, by + bh); c.lineTo(cx, by + bh + 9); c.fill();
  c.font = "700 22px 'Courier New', monospace";
  c.fillStyle = P.amberLt; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(dots, cx, by + bh / 2 + 1);
  c.textAlign = "left"; c.textBaseline = "alphabetic";

  // pulsing magnifier just left of the bubble
  magnifier(c, bx - 6, by + bh / 2, 1 + 0.18 * pulse, 0.95);
}
