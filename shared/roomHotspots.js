// The interactable hotspots in each room — now DERIVED, not hand-written.
//
// This used to be a hand-maintained table of normalized points whose own comment
// admitted they were "tuned to sit roughly over the furniture drawBoard.js
// paints". That second source of truth had already drifted (the Study advertised
// a `study_fireplace` over a spot where the renderer drew a floor lamp). Hotspots
// are now generated from the `searchable` entries in `shared/roomObjects.js`, so
// a marker can never again point at furniture that isn't there.
//
// The exported shape is UNCHANGED — `{ id, name, x, y }` with x/y normalized
// 0..1 inside the room box — so every existing consumer (client proximity +
// indicators, server examine validation, the case validator) keeps working.
// Contains NO clue mapping, so it stays safe to ship to a client.
import { ROOM_OBJECTS, searchableObjectsIn, objectCenter } from "./roomObjects.js";
import { GEO } from "./mapData.js";

// Room-relative pixels -> normalized 0..1 within the room box.
const normalize = (o) => {
  const c = objectCenter(o);
  return { x: c.x / GEO.roomW, y: c.y / GEO.roomH };
};

export const ROOM_HOTSPOTS = Object.fromEntries(
  Object.keys(ROOM_OBJECTS).map((room) => [
    room,
    searchableObjectsIn(room).map((o) => ({ id: o.id, name: o.name, ...normalize(o) })),
  ])
);

// id -> { room, name, x, y } for O(1) lookup/validation.
export const HOTSPOT_BY_ID = Object.fromEntries(
  Object.entries(ROOM_HOTSPOTS).flatMap(([room, list]) =>
    list.map((h) => [h.id, { room, ...h }])
  )
);

export function hotspotsForRoom(roomId) {
  return ROOM_HOTSPOTS[roomId] || [];
}
