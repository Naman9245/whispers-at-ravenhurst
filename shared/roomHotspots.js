// SINGLE SOURCE OF TRUTH for the interactable hotspots in each room. Imported by
// the client (to draw indicators + detect proximity) and the server (to validate
// a case's clue placements and an examine request). Contains NO clue mapping —
// only ids, labels, and positions — so it is safe to ship to a client.
//
// Coordinates are NORMALIZED (0–1) within a room's bounding box; the client scales
// them to pixels via roomRect(). They are tuned to sit roughly over the furniture
// drawBoard.js paints, and kept inside ~[0.12, 0.88] so the player's feet can
// always reach within the examine radius (collision keeps feet ≥ WALL_INSET=16px
// off the walls). Four hotspots per room, 24 total.

export const ROOM_HOTSPOTS = {
  study: [
    { id: "study_desk",       name: "The Desk",       x: 0.50, y: 0.50 },
    { id: "study_bookshelf",  name: "The Bookshelf",  x: 0.20, y: 0.20 },
    { id: "study_fireplace",  name: "The Fireplace",  x: 0.82, y: 0.80 },
    { id: "study_armchair",   name: "The Armchair",   x: 0.50, y: 0.74 },
  ],
  dining: [
    { id: "dining_table",        name: "The Dining Table", x: 0.50, y: 0.50 },
    { id: "dining_sideboard",    name: "The Sideboard",    x: 0.18, y: 0.30 },
    { id: "dining_chandelier",   name: "The Chandelier",   x: 0.50, y: 0.18 },
    { id: "dining_wine_cabinet", name: "The Wine Cabinet", x: 0.82, y: 0.30 },
  ],
  lounge: [
    { id: "lounge_sofa",         name: "The Sofa",         x: 0.50, y: 0.72 },
    { id: "lounge_fireplace",    name: "The Fireplace",    x: 0.50, y: 0.22 },
    { id: "lounge_coffee_table", name: "The Coffee Table", x: 0.30, y: 0.52 },
    { id: "lounge_painting",     name: "The Wall Painting",x: 0.80, y: 0.20 },
  ],
  library: [
    { id: "library_bookshelves",  name: "The Tall Bookshelves", x: 0.20, y: 0.20 },
    { id: "library_reading_chair",name: "The Reading Chair",    x: 0.32, y: 0.75 },
    { id: "library_fireplace",    name: "The Fireplace",        x: 0.50, y: 0.50 },
    { id: "library_writing_desk", name: "The Writing Desk",     x: 0.80, y: 0.22 },
  ],
  kitchen: [
    { id: "kitchen_stove",     name: "The Stove",      x: 0.50, y: 0.50 },
    { id: "kitchen_knife_rack",name: "The Knife Rack", x: 0.50, y: 0.20 },
    { id: "kitchen_pantry",    name: "The Pantry",     x: 0.82, y: 0.50 },
    { id: "kitchen_sink",      name: "The Sink",       x: 0.20, y: 0.52 },
  ],
  conservatory: [
    { id: "conservatory_plants",  name: "The Plant Pots",   x: 0.20, y: 0.80 },
    { id: "conservatory_bench",   name: "The Garden Bench", x: 0.50, y: 0.55 },
    { id: "conservatory_windows", name: "The Glass Windows",x: 0.50, y: 0.22 },
    { id: "conservatory_fountain",name: "The Fountain",     x: 0.80, y: 0.80 },
  ],
};

// id -> { room, name, x, y } for O(1) lookup/validation.
export const HOTSPOT_BY_ID = Object.fromEntries(
  Object.entries(ROOM_HOTSPOTS).flatMap(([room, list]) =>
    list.map((h) => [h.id, { room, ...h }])
  )
);

export function hotspotsForRoom(roomId) {
  return ROOM_HOTSPOTS[roomId] || [];
}
