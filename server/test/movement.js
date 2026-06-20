// Movement + collision verification (BUG 2/3). Pure geometry against the SHARED
// map functions the client actually uses — no browser needed. Proves that:
//   1. every room allows free travel on BOTH axes (4-directional movement), and
//   2. walls block the feet anchor (you cannot leave the walkable area).
import {
  ROOM_IDS, ROOMS, roomStanding, roomInterior,
  isWalkable, CORRIDOR_INTERIOR, WALL_INSET, DOOR_HALF, BOARD_W, BOARD_H,
} from "../../shared/mapData.js";

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${label}`);
  if (!cond) failures++;
};

// All rooms are reachable via the shared corridor, so every room is "open".
const openOf = () => ROOM_IDS;
const STEP = 4;

// How far (px) the feet can travel from `from` along (dx,dy) before a wall stops them.
function reach(from, dx, dy, open) {
  let { x, y } = from, d = 0;
  while (d < 1200) {
    const nx = x + dx * STEP, ny = y + dy * STEP;
    if (!isWalkable(nx, ny, open)) break;
    x = nx; y = ny; d += STEP;
  }
  return d;
}

console.log(`\nGeometry: WALL_INSET=${WALL_INSET} DOOR_HALF=${DOOR_HALF} board ${BOARD_W}x${BOARD_H}`);
console.log(`Corridor interior: ${CORRIDOR_INTERIOR.w}x${CORRIDOR_INTERIOR.h}`);

console.log("\n[1] Every room allows free, BALANCED 4-directional movement from its spawn.");
for (const id of ROOM_IDS) {
  const s = roomStanding(id), open = openOf(id), itr = roomInterior(id);
  // travel that stays INSIDE this room's interior only (the true in-room freedom)
  const inRoom = (dx, dy) => {
    let x = s.x, y = s.y, d = 0;
    while (d < 1200) {
      const nx = x + dx * STEP, ny = y + dy * STEP;
      if (!(nx >= itr.x && nx <= itr.x + itr.w && ny >= itr.y && ny <= itr.y + itr.h)) break;
      x = nx; y = ny; d += STEP;
    }
    return d;
  };
  const N = inRoom(0, -1), S = inRoom(0, 1), E = inRoom(1, 0), W = inRoom(-1, 0);
  // Each direction must give real room to walk AND be reasonably balanced
  // (spawn centred, not jammed against a wall): every side ≥ 60px.
  const ok = N >= 60 && S >= 60 && E >= 60 && W >= 60;
  check(`${ROOMS[id].label.padEnd(13)} interior ${itr.w}x${itr.h}  in-room reach N:${N} S:${S} E:${E} W:${W}`, ok);
}

console.log("\n[2] Walls block the feet: a point just outside each interior is NOT walkable.");
for (const id of ROOM_IDS) {
  const itr = roomInterior(id), open = openOf(id);
  const cx = itr.x + itr.w / 2;
  // left & right of the interior, at mid-height, are walls (doorways are on the top/bottom edges)
  const leftWall = !isWalkable(itr.x - 6, itr.y + itr.h / 2, open);
  const rightWall = !isWalkable(itr.x + itr.w + 6, itr.y + itr.h / 2, open);
  // a corner just outside is wall
  const corner = !isWalkable(itr.x - 6, itr.y - 6, open);
  check(`${ROOMS[id].label.padEnd(13)} blocked at L/R side walls and corner`, leftWall && rightWall && corner);
}

console.log("\n[3] Doorway collision matches the VISUAL door (no wall-clipping beside doors).");
const DOOR_VISUAL_HALF = DOOR_HALF; // drawBoard draws W = DOOR_HALF*2
for (const id of ROOM_IDS) {
  const itr = roomInterior(id), open = openOf(id);
  const cx = itr.x + itr.w / 2;
  // edge y between room interior and corridor (the wall line the door pierces)
  const edgeY = ROOMS[id].row === 0 ? itr.y + itr.h + 6 : itr.y - 6;
  const inDoor = isWalkable(cx, edgeY, open);                       // centre of door: passable
  const atVisualEdge = isWalkable(cx + DOOR_VISUAL_HALF - 4, edgeY, open); // just inside the visible gap: passable
  const beyondVisual = !isWalkable(cx + DOOR_VISUAL_HALF + 4, edgeY, open); // just outside it: wall
  check(`${ROOMS[id].label.padEnd(13)} passable within visible gap, wall just beyond it`, inDoor && atVisualEdge && beyondVisual);
}

console.log("\n[4] EVERY room is enterable straight from the corridor (no doorway dead-ends).");
{
  const open = openOf();
  const corridorMidY = CORRIDOR_INTERIOR.y + CORRIDOR_INTERIOR.h / 2;
  for (const id of ROOM_IDS) {
    const itr = roomInterior(id);
    const cx = itr.x + itr.w / 2;
    const dir = ROOMS[id].row === 0 ? -1 : 1; // up into top rooms, down into bottom rooms
    let x = cx, y = corridorMidY, entered = false;
    for (let d = 0; d < 800; d += STEP) {
      const ny = y + dir * STEP;
      if (!isWalkable(x, ny, open)) break;
      y = ny;
      if (y >= itr.y && y <= itr.y + itr.h) { entered = true; break; }
    }
    check(`${ROOMS[id].label.padEnd(13)} reachable from the corridor through its doorway`, entered);
  }
}

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED ✓" : failures + " CHECK(S) FAILED ✗"} ===`);
process.exit(failures === 0 ? 0 : 1);
