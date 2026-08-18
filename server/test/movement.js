// Movement + collision verification (BUG 2/3). Pure geometry against the SHARED
// map functions the client actually uses — no browser needed. Proves that:
//   1. every room allows free travel on BOTH axes (4-directional movement), and
//   2. walls block the feet anchor (you cannot leave the walkable area).
import {
  ROOM_IDS, ROOMS, roomStanding, roomInterior,
  isWalkable, CORRIDOR_INTERIOR, WALL_INSET, DOOR_HALF, BOARD_W, BOARD_H,
  roomRect,
} from "../../shared/mapData.js";
import { searchableObjectsIn, solidObjectsIn, distanceToRect } from "../../shared/roomObjects.js";
import { EXAMINE_RADIUS } from "../../shared/constants.js";

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


// [5] HOTSPOT REACHABILITY -- the guard that makes solid furniture safe to scale.
//
// Marking furniture `solid` carves holes out of the walkable floor. If a piece is
// boxed in (or is itself the only thing beside its own hotspot), the player can
// end up unable to get within EXAMINE_RADIUS of it -- and because clues are
// PLACED on hotspots, that silently makes a clue unfindable and the case
// unsolvable. Nothing else would catch it: the server would happily accept the
// examine, the player just could never trigger it. So for EVERY searchable
// object, assert a walkable standing spot exists within reach of its rect.
console.log("\n[5] Every searchable hotspot is reachable (solid furniture cannot seal a clue away).");
{
  const open = openOf();
  const GRID = 2;   // sampling resolution over the room interior, px
  for (const id of ROOM_IDS) {
    const rr = roomRect(id);
    const itr = roomInterior(id);
    let worst = 0, worstName = "-";
    for (const o of searchableObjectsIn(id)) {
      let best = Infinity;
      for (let py = itr.y; py <= itr.y + itr.h && best > 0; py += GRID) {
        for (let px = itr.x; px <= itr.x + itr.w && best > 0; px += GRID) {
          if (!isWalkable(px, py, open)) continue;             // inside furniture / off-floor
          const d = distanceToRect(px - rr.x, py - rr.y, o);   // room-relative
          if (d < best) best = d;
        }
      }
      if (best > worst) { worst = best; worstName = o.name; }
      if (best > EXAMINE_RADIUS) {
        check(`${ROOMS[id].label.padEnd(13)} "${o.name}" UNREACHABLE - nearest floor ${best.toFixed(1)}px (limit ${EXAMINE_RADIUS})`, false);
      }
    }
    const solids = solidObjectsIn(id).length;
    check(
      `${ROOMS[id].label.padEnd(13)} ${searchableObjectsIn(id).length} hotspots reachable; ` +
      `${solids} solid; worst "${worstName}" ${worst.toFixed(1)}px <= ${EXAMINE_RADIUS}`,
      worst <= EXAMINE_RADIUS
    );
  }
}

// [6] Solid furniture must never plug a doorway -- that would seal a room shut.
console.log("\n[6] The doorway approach still lands on walkable floor in every room.");
{
  const open = openOf();
  for (const id of ROOM_IDS) {
    const itr = roomInterior(id);
    const cx = itr.x + itr.w / 2;
    const dir = ROOMS[id].row === 0 ? -1 : 1;
    let y = ROOMS[id].row === 0 ? itr.y + itr.h + 20 : itr.y - 20, ok = false;
    for (let d = 0; d < 400; d += STEP) {
      y += dir * STEP;
      if (y >= itr.y && y <= itr.y + itr.h) { ok = isWalkable(cx, y, open); break; }
    }
    check(`${ROOMS[id].label.padEnd(13)} doorway approach is not blocked by furniture`, ok);
  }
}


// [7] SPAWN SAFETY -- roomStanding() must land on walkable floor in every room.
//
// Regression guard for a real bug: the Study's desk was made `solid` and its rect
// covered the room centre, which is exactly what roomStanding() returned. The
// detective spawned INSIDE the desk's collision box with every direction blocked
// and could not move for the entire game. The reachability check in [5] did not
// catch it -- hotspots were all reachable, just not from where you start.
console.log("\n[7] roomStanding() spawns on walkable floor (never inside solid furniture).");
{
  const open = openOf();
  for (const id of ROOM_IDS) {
    const s = roomStanding(id);
    const walkable = isWalkable(s.x, s.y, open);
    // And you must be able to actually leave the spot in at least one direction.
    const canLeave = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => isWalkable(s.x + dx*STEP, s.y + dy*STEP, open));
    check(`${ROOMS[id].label.padEnd(13)} spawn (${s.x.toFixed(0)},${s.y.toFixed(0)}) is walkable and not boxed in`, walkable && canLeave);
  }
}


// [8] CONNECTIVITY -- the walkable floor of each room must be ONE region, and
// every hotspot must be reachable from the part of it you actually enter.
//
// [5] samples every walkable interior point and measures distance to each
// hotspot; [6] only checks the first cell inside the door. A ring of furniture
// can therefore carve an ISLAND of floor that satisfies both while being
// unreachable from the doorway -- the clue on it would be permanently
// unfindable. Flood-fill from the door and require the hotspots to be in the
// flooded region, not merely somewhere on the map.
console.log("\n[8] Walkable floor is one connected region reachable from the door.");
{
  const open = openOf();
  const G = 4;   // flood grid, px
  for (const id of ROOM_IDS) {
    const rr = roomRect(id);
    const itr = roomInterior(id);
    const key = (gx, gy) => gx + "," + gy;
    // Enter from the corridor-facing edge: bottom wall for row 0, top for row 1.
    const startX = Math.round((itr.x + itr.w / 2) / G) * G;
    const startY = ROOMS[id].row === 0
      ? Math.round((itr.y + itr.h - G) / G) * G
      : Math.round((itr.y + G) / G) * G;

    const seen = new Set(), queue = [[startX, startY]];
    if (isWalkable(startX, startY, open)) seen.add(key(startX, startY));
    while (queue.length) {
      const [gx, gy] = queue.pop();
      for (const [dx, dy] of [[G,0],[-G,0],[0,G],[0,-G]]) {
        const nx = gx + dx, ny = gy + dy;
        if (nx < itr.x || nx > itr.x + itr.w || ny < itr.y || ny > itr.y + itr.h) continue;
        const k = key(nx, ny);
        if (seen.has(k) || !isWalkable(nx, ny, open)) continue;
        seen.add(k); queue.push([nx, ny]);
      }
    }

    // Every searchable object needs a FLOODED standing spot within reach.
    let unreachable = [];
    for (const o of searchableObjectsIn(id)) {
      let best = Infinity;
      for (const k of seen) {
        const [px, py] = k.split(",").map(Number);
        const d = distanceToRect(px - rr.x, py - rr.y, o);
        if (d < best) best = d;
      }
      if (best > EXAMINE_RADIUS) unreachable.push(`${o.name} (${best.toFixed(0)}px)`);
    }
    const spawn = roomStanding(id);
    const spawnKey = key(Math.round(spawn.x / G) * G, Math.round(spawn.y / G) * G);
    const spawnConnected = seen.has(spawnKey) ||
      [[G,0],[-G,0],[0,G],[0,-G]].some(([dx,dy]) => seen.has(key(Math.round(spawn.x/G)*G+dx, Math.round(spawn.y/G)*G+dy)));

    check(
      `${ROOMS[id].label.padEnd(13)} ${seen.size} floor cells reachable from the door; ` +
      `all hotspots + spawn connected${unreachable.length ? " -- STRANDED: " + unreachable.join(", ") : ""}`,
      unreachable.length === 0 && spawnConnected
    );
  }
}

// [9] The literal room CENTRE must stay walkable. roomStanding() spirals to a
// nearby free spot if the centre is blocked, so [7] can pass while the centre
// itself is furniture -- but `.shots/overhaul-test.mjs` walks to the exact
// centre of every room and gives up after 8 stalled steps.
console.log("\n[9] The exact room centre is walkable (e2e movement targets it directly).");
{
  const open = openOf();
  for (const id of ROOM_IDS) {
    const r = roomRect(id);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    check(`${ROOMS[id].label.padEnd(13)} centre (${cx},${cy}) is walkable`, isWalkable(cx, cy, open));
  }
}

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED ✓" : failures + " CHECK(S) FAILED ✗"} ===`);
process.exit(failures === 0 ? 0 : 1);
