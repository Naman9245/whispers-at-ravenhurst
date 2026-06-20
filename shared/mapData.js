// SINGLE SOURCE OF TRUTH for the mansion, imported by BOTH the client (to draw
// and animate) and the server (to validate movement). Keeping the connection
// graph in one module makes it impossible for client and server to disagree.

export const MAP_ID = "ravenhurst_manor";

export const PALETTE = {
  bg: "#261a34", bg2: "#1d1428",
  hall: "#4a2f52", hallEdge: "#5c3a66",
  wall: "#3d2a30", wallLt: "#5c3e38",
  floor: "#2e4a44", floorDk: "#263e39",
  rug: "#4a2c34",
  wood: "#6e462a", woodDk: "#52341f", woodLt: "#8c5c38",
  amber: "#f0b040", amberLt: "#ffd678",
  cream: "#f0e6d2", tealTxt: "#6fd6c4", amberTxt: "#f0b85c",
  green: "#4a6e50", glass: "#8cc4d6", fire: "#f08232",
  panel: "rgba(20,14,26,0.92)",
};

// Board geometry (internal canvas resolution; scaled to fit the viewport).
export const GEO = { margin: 44, roomW: 384, roomH: 252, hall: 116, topBar: 120, bottomBar: 120 };

export const COLS = [
  GEO.margin,
  GEO.margin + GEO.roomW + GEO.hall,
  GEO.margin + 2 * (GEO.roomW + GEO.hall),
];
export const ROWS = [GEO.topBar, GEO.topBar + GEO.roomH + GEO.hall];

export const BOARD_W = COLS[2] + GEO.roomW + GEO.margin;
export const BOARD_H = ROWS[1] + GEO.roomH + GEO.bottomBar;

// Room id -> grid cell + display label. Order = draw order.
export const ROOMS = {
  study:        { label: "STUDY",        col: 0, row: 0 },
  dining:       { label: "DINING HALL",  col: 1, row: 0 },
  lounge:       { label: "LOUNGE",       col: 2, row: 0 },
  library:      { label: "LIBRARY",      col: 0, row: 1 },
  kitchen:      { label: "KITCHEN",      col: 1, row: 1 },
  conservatory: { label: "CONSERVATORY", col: 2, row: 1 },
};

// Connection graph — RAVENHURST MANOR (per Phase 1 brief).
// Note vs. earlier prototype: Dining Hall <-> Kitchen is ADDED; Lounge <-> Kitchen is REMOVED.
export const CONNECTIONS = [
  ["study", "library"],
  ["study", "dining"],
  ["library", "kitchen"],
  ["dining", "lounge"],
  ["dining", "kitchen"],
  ["lounge", "conservatory"],
  ["kitchen", "conservatory"],
];

// Adjacency map for O(1) server-side "can I move there?" checks.
export const ADJACENCY = CONNECTIONS.reduce((acc, [a, b]) => {
  (acc[a] ||= []).push(b);
  (acc[b] ||= []).push(a);
  return acc;
}, {});

export const ROOM_IDS = Object.keys(ROOMS);

// ---- geometry helpers (used by the renderer; harmless on the server) -------
export function roomRect(id) {
  const { col, row } = ROOMS[id];
  return { x: COLS[col], y: ROWS[row], w: GEO.roomW, h: GEO.roomH };
}
export function roomCenter(id) {
  const r = roomRect(id);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export const CORRIDOR_Y = (ROWS[0] + GEO.roomH + ROWS[1]) / 2;

// Where a character's FEET stand when entering a room. Centred in the room
// interior (both axes) so the player can immediately walk freely in ALL four
// directions — not pinned against a wall or the doorway. (Previously the spawn
// sat 24px from the inner wall, which made rooms feel one-directional.)
export function roomStanding(id) {
  const r = roomRect(id);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
function roomDoor(id) {
  const { col, row } = ROOMS[id];
  const x = COLS[col] + GEO.roomW / 2;
  const y = row === 0 ? ROWS[0] + GEO.roomH : ROWS[1];
  return { x, y };
}
// Waypoints from room a's standing spot to room b's, staying on floor + corridor.
export function pathBetween(a, b) {
  const ad = roomDoor(a), bd = roomDoor(b), bs = roomStanding(b);
  const raw = [ad, { x: ad.x, y: CORRIDOR_Y }, { x: bd.x, y: CORRIDOR_Y }, bd, bs];
  const out = [];
  for (const p of raw) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  return out;
}

// Server-side validation helper.
export function areAdjacent(a, b) {
  return Boolean(ADJACENCY[a]?.includes(b));
}

// ---- walkable geometry (free-roam movement + collision) ----------------
// The player walks freely inside room interiors and the central corridor,
// crossing between them only through a doorway gap. Rooms are "open" (walkable)
// only when they're the current room or one of its graph-neighbours — so the
// connection graph still gates which rooms you can actually enter.
export const WALL_INSET = 16;   // wall thickness kept clear of the play area
// Half-width of a doorway gap. MUST match the visual door drawn in drawBoard.js
// (it draws W = DOOR_HALF * 2) so the feet can never stand on the wall *beside* a
// door — that mismatch (collision wider than the visible gap) was the wall-clip
// bug. Kept generous so walking into a room through the doorway is forgiving.
export const DOOR_HALF = 44;

const CORRIDOR_TOP = ROWS[0] + GEO.roomH;   // 372
const CORRIDOR_BOTTOM = ROWS[1];            // 488

export const CORRIDOR_INTERIOR = {
  x: GEO.margin + WALL_INSET,
  y: CORRIDOR_TOP + WALL_INSET,
  w: BOARD_W - 2 * (GEO.margin + WALL_INSET),
  h: (CORRIDOR_BOTTOM - CORRIDOR_TOP) - 2 * WALL_INSET,
};

export function roomInterior(id) {
  const r = roomRect(id);
  return { x: r.x + WALL_INSET, y: r.y + WALL_INSET, w: r.w - 2 * WALL_INSET, h: r.h - 2 * WALL_INSET };
}

// A doorway bridges a room's inner wall and the corridor at the room's centre.
export function doorwayRect(id) {
  const { col, row } = ROOMS[id];
  const cx = COLS[col] + GEO.roomW / 2;
  const y = row === 0 ? CORRIDOR_TOP - WALL_INSET : CORRIDOR_BOTTOM - WALL_INSET;
  return { x: cx - DOOR_HALF, y, w: DOOR_HALF * 2, h: WALL_INSET * 2 };
}

const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// Is (x, y) somewhere the player may stand, given which rooms are currently open?
export function isWalkable(x, y, openRoomIds) {
  if (inRect(x, y, CORRIDOR_INTERIOR)) return true;
  for (const id of openRoomIds) {
    if (inRect(x, y, roomInterior(id)) || inRect(x, y, doorwayRect(id))) return true;
  }
  return false;
}

// Which room interior contains (x, y)? null means the corridor / a doorway.
export function roomAt(x, y, roomIds) {
  for (const id of roomIds) if (inRect(x, y, roomInterior(id))) return id;
  return null;
}
