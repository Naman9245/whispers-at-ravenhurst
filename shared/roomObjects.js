// SINGLE SOURCE OF TRUTH for the physical furniture in each room.
//
// Before this module there were TWO independent lists that had to be kept in
// visual sync by hand: `drawBoard.js`'s hardcoded `decorate()` switch (which
// painted furniture) and `roomHotspots.js` (which held the searchable points,
// with a comment openly admitting they were "tuned to sit roughly over the
// furniture drawBoard.js paints"). They had already drifted — the Study listed a
// `study_fireplace` hotspot over a spot where the renderer drew a floor lamp.
//
// Now one table drives all three consumers:
//   • collision   — `mapData.isWalkable()` subtracts every `solid` rect
//   • hotspots    — `roomHotspots.js` derives ROOM_HOTSPOTS from `searchable`
//   • rendering   — `drawBoard.js` paints from `kind` + the rect
//
// COORDINATES are room-relative pixels against GEO.roomW x GEO.roomH
// (384 x 252). The room's wall inset is WALL_INSET = 16, so the walkable
// interior is x/y 16..368/236; a rect may legitimately overlap that border when
// the piece is meant to sit flush against a wall (a bookshelf, say) — collision
// simply clips against the wall it is already touching.
//
// ⚠️ `id` values are LOAD-BEARING: `fallbackCase.json` places clues by hotspot
// id and `caseSchema.validateCase()` cross-checks id -> room. Never rename or
// re-room a searchable object without migrating the case data.
//
// ALL SIX ROOMS are migrated: every room's art is painted from this table by
// drawBoard's `drawFromObjects`, so a collision box can never disagree with what
// the player sees. The rect that is drawn IS the rect that blocks.
//
// LAYOUT RULE, learned the hard way — a first pass put the Study desk dead-centre
// and spawned the detective INSIDE its collision box, unable to move at all:
//   • keep the room CENTRE (192, 126) clear — that is the spawn point
//   • keep the DOOR COLUMN clear (room-relative x 148..236) from the centre out
//     to the door edge: the BOTTOM wall for row-0 rooms (study/dining/lounge),
//     the TOP wall for row-1 rooms (library/kitchen/conservatory)
// `server/test/movement.js` [5] [6] [7] enforce all of this — hotspot
// reachability, doorway clearance, and spawn safety.
//
// Pieces that hang on a wall or from the ceiling (paintings, the knife rack, the
// chandelier, glazing) are deliberately `solid: false` — they are above or behind
// the floor plane, so they are examinable without ever being an obstacle.

// Room-relative furniture. `kind` selects the renderer; `solid` blocks feet;
// `searchable` promotes the object to an examinable hotspot (needs `name`).
export const ROOM_OBJECTS = {
  // ---- STUDY — migrated: rendered from this table, collision live ----------
  study: [
    // LAYOUT RULE for any room with solid furniture: keep the spawn point (the
    // room centre, 192/126) and the corridor door column (room-relative x
    // 148..236, running down to the bottom wall) CLEAR. A first pass put the desk
    // dead-centre, which spawned the detective inside it and walled the exit off —
    // pieces hug the walls and corners instead, leaving an open centre aisle.
    { id: "study_rug", kind: "rug", x: 120, y: 120, w: 160, h: 100, solid: false, searchable: false },
    { id: "study_bookshelf", name: "The Bookshelf", kind: "bookshelf", x: 10, y: 8, w: 192, h: 40, solid: true, searchable: true },
    { id: "study_desk", name: "The Desk", kind: "desk", x: 240, y: 60, w: 110, h: 52, solid: true, searchable: true },
    { id: "study_armchair", name: "The Armchair", kind: "armchair", x: 70, y: 150, w: 34, h: 32, solid: true, searchable: true },
    { id: "study_fireplace", name: "The Fireplace", kind: "fireplace", x: 288, y: 150, w: 80, h: 52, solid: true, searchable: true },
    { id: "study_lamp", kind: "lamp", x: 36, y: 200, w: 16, h: 16, solid: false, searchable: false },
    { id: "study_painting_a", kind: "painting", x: 232, y: 12, w: 44, h: 32, solid: false, searchable: false },
    { id: "study_painting_b", kind: "painting", x: 300, y: 14, w: 34, h: 26, solid: false, searchable: false },
  ],

  // ---- DINING HALL — row 0, door at the BOTTOM (aisle x148..236, y126..252) --
  dining: [
    { id: "dining_rug", kind: "rug", x: 24, y: 74, w: 130, h: 96, solid: false, searchable: false, color: "#4a2c34" },
    { id: "dining_table", name: "The Dining Table", kind: "desk", x: 30, y: 88, w: 112, h: 64, solid: true, searchable: true },
    { id: "dining_chair_a", kind: "chair", x: 42, y: 68, w: 20, h: 16, solid: true, searchable: false },
    { id: "dining_chair_b", kind: "chair", x: 76, y: 68, w: 20, h: 16, solid: true, searchable: false },
    { id: "dining_chair_c", kind: "chair", x: 110, y: 68, w: 20, h: 16, solid: true, searchable: false },
    { id: "dining_chair_d", kind: "chair", x: 42, y: 156, w: 20, h: 16, solid: true, searchable: false },
    { id: "dining_chair_e", kind: "chair", x: 76, y: 156, w: 20, h: 16, solid: true, searchable: false },
    { id: "dining_chair_f", kind: "chair", x: 110, y: 156, w: 20, h: 16, solid: true, searchable: false },
    { id: "dining_sideboard", name: "The Sideboard", kind: "bookshelf", x: 28, y: 12, w: 92, h: 34, solid: true, searchable: true },
    // Overhead — hangs above head height, so it is examinable but never blocks.
    { id: "dining_chandelier", name: "The Chandelier", kind: "lamp", x: 174, y: 26, w: 36, h: 36, solid: false, searchable: true },
    { id: "dining_wine_cabinet", name: "The Wine Cabinet", kind: "bookshelf", x: 276, y: 56, w: 74, h: 42, solid: true, searchable: true },
    { id: "dining_lamp_l", kind: "lamp", x: 286, y: 186, w: 16, h: 16, solid: false, searchable: false },
  ],

  // ---- LOUNGE — row 0, door at the BOTTOM ----------------------------------
  lounge: [
    { id: "lounge_rug", kind: "rug", x: 30, y: 86, w: 120, h: 112, solid: false, searchable: false, color: "#4a2c34" },
    { id: "lounge_fireplace", name: "The Fireplace", kind: "fireplace", x: 150, y: 10, w: 84, h: 46, solid: true, searchable: true },
    { id: "lounge_sofa", name: "The Sofa", kind: "sofa", x: 36, y: 152, w: 104, h: 40, solid: true, searchable: true },
    { id: "lounge_coffee_table", name: "The Coffee Table", kind: "desk", x: 44, y: 96, w: 72, h: 34, solid: true, searchable: true },
    // Wall-hung: on the wall, not on the floor — decoration, never an obstacle.
    { id: "lounge_painting", name: "The Wall Painting", kind: "painting", x: 292, y: 14, w: 46, h: 34, solid: false, searchable: true },
    { id: "lounge_plant", kind: "plant", x: 296, y: 186, w: 30, h: 30, solid: true, searchable: false },
    { id: "lounge_lamp", kind: "lamp", x: 288, y: 108, w: 16, h: 16, solid: false, searchable: false },
  ],

  // ---- LIBRARY — row 1, door at the TOP (aisle x148..236, y0..126) ---------
  library: [
    { id: "library_rug", kind: "rug", x: 118, y: 108, w: 150, h: 104, solid: false, searchable: false, color: "#4a2c34" },
    { id: "library_bookshelves", name: "The Tall Bookshelves", kind: "bookshelf", x: 10, y: 44, w: 124, h: 44, solid: true, searchable: true },
    { id: "library_shelf_b", kind: "bookshelf", x: 10, y: 100, w: 96, h: 40, solid: true, searchable: false },
    { id: "library_writing_desk", name: "The Writing Desk", kind: "desk", x: 256, y: 44, w: 100, h: 46, solid: true, searchable: true },
    { id: "library_fireplace", name: "The Fireplace", kind: "fireplace", x: 152, y: 178, w: 84, h: 48, solid: true, searchable: true },
    { id: "library_reading_chair", name: "The Reading Chair", kind: "armchair", x: 56, y: 172, w: 38, h: 36, solid: true, searchable: true },
    { id: "library_lamp", kind: "lamp", x: 292, y: 190, w: 16, h: 16, solid: false, searchable: false },
  ],

  // ---- KITCHEN — row 1, door at the TOP ------------------------------------
  kitchen: [
    { id: "kitchen_floor", kind: "rug", x: 26, y: 46, w: 320, h: 176, solid: false, searchable: false, color: "#263e39" },
    // Wall-mounted rack — hangs on the wall, so it is reachable but not solid.
    { id: "kitchen_knife_rack", name: "The Knife Rack", kind: "painting", x: 166, y: 28, w: 54, h: 22, solid: false, searchable: true },
    { id: "kitchen_stove", name: "The Stove", kind: "stove", x: 36, y: 148, w: 72, h: 52, solid: true, searchable: true },
    { id: "kitchen_sink", name: "The Sink", kind: "counter", x: 36, y: 62, w: 72, h: 44, solid: true, searchable: true },
    { id: "kitchen_pantry", name: "The Pantry", kind: "fridge", x: 288, y: 136, w: 46, h: 72, solid: true, searchable: true },
    { id: "kitchen_counter", kind: "counter", x: 262, y: 44, w: 84, h: 38, solid: true, searchable: false },
  ],

  // ---- CONSERVATORY — row 1, door at the TOP -------------------------------
  conservatory: [
    // Glazing is split either side of the door column so the entrance stays clear.
    { id: "conservatory_glass_l", kind: "window", x: 12, y: 12, w: 116, h: 36, solid: false, searchable: false },
    { id: "conservatory_windows", name: "The Glass Windows", kind: "window", x: 244, y: 12, w: 112, h: 36, solid: false, searchable: true },
    { id: "conservatory_bench", name: "The Garden Bench", kind: "bench", x: 54, y: 150, w: 84, h: 28, solid: true, searchable: true },
    { id: "conservatory_plants", name: "The Plant Pots", kind: "plant", x: 34, y: 196, w: 32, h: 32, solid: true, searchable: true },
    { id: "conservatory_fountain", name: "The Fountain", kind: "plant", x: 282, y: 176, w: 44, h: 44, solid: true, searchable: true },
    { id: "conservatory_plant_b", kind: "plant", x: 300, y: 84, w: 28, h: 28, solid: true, searchable: false },
    { id: "conservatory_plant_c", kind: "plant", x: 44, y: 84, w: 28, h: 28, solid: true, searchable: false },
  ],
};

export const OBJECT_ROOM_IDS = Object.keys(ROOM_OBJECTS);

// Every object, flattened, with its room stamped on. O(1) lookup by id.
export const OBJECT_BY_ID = Object.fromEntries(
  Object.entries(ROOM_OBJECTS).flatMap(([room, list]) => list.map((o) => [o.id, { room, ...o }]))
);

export const objectsIn = (roomId) => ROOM_OBJECTS[roomId] || [];
export const solidObjectsIn = (roomId) => objectsIn(roomId).filter((o) => o.solid);
export const searchableObjectsIn = (roomId) => objectsIn(roomId).filter((o) => o.searchable);

// Centre of an object in ROOM-RELATIVE pixels — where the hotspot marker sits.
export const objectCenter = (o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 });

// Shortest distance from a point to a rectangle (0 when inside it).
//
// This is the model that makes solid furniture examinable at all: measuring to
// an object's CENTRE would put the middle of a desk ~28px from its own edge, so
// with a 26px reach a player standing flush against a solid desk could never
// examine it. Measuring to the nearest point on the rect means "am I standing
// next to this thing?", which is both correct and what a player expects.
export function distanceToRect(px, py, r) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

// Is a ROOM-RELATIVE point inside any solid piece of furniture in this room?
export function inSolidObject(rx, ry, roomId) {
  for (const o of solidObjectsIn(roomId)) {
    if (rx >= o.x && rx <= o.x + o.w && ry >= o.y && ry <= o.y + o.h) return true;
  }
  return false;
}
