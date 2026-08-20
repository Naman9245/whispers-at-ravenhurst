// Where the detective is standing, right now, in board pixels.
//
// The manor map needs a live "you are here" dot that moves as you walk — including
// through the corridor, where there is no room to highlight. That means the map has
// to read the character's position every frame while it is open.
//
// Deliberately module state and NOT React state, for the same reason bubbles.js is:
// the character moves every frame, and routing that through setState would be sixty
// re-renders a second of the entire game tree to move one dot.
//
// It is also NOT window.__wrChar — that handle is stripped from production builds,
// so a map that read it would work in dev and quietly break for real players.
let pos = { x: 0, y: 0, room: null, inCorridor: false };

/** Called once per animation frame by BoardCanvas. Cheap on purpose. */
export function setPlayerPos(x, y, room, inCorridor) {
  pos.x = x;
  pos.y = y;
  pos.room = room;
  pos.inCorridor = inCorridor;
}

/** The detective's current feet position + region. Never null. */
export function getPlayerPos() {
  return pos;
}
