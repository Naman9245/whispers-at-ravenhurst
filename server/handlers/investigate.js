// SERVER-AUTHORITATIVE investigation (Phase 1 step 7).
// Reveals ALL of the requesting player's clues for the room they're standing in,
// at once (no drip-feeding). The room is then "searched" for that player only —
// the opponent can still find their own clues there. The clue contents go back to
// the searcher alone; the opponent only gets a vague, location-free ambient note.
export function registerInvestigate(io, socket, store) {
  socket.on("investigate", (_payload, cb) => {
    const room = store.roomOf(socket);
    if (!room) return cb?.({ ok: false, error: "Not in a room." });

    const result = room.tryInvestigate(socket.id);
    if (!result.ok) return cb?.(result);

    const me = room.player(socket.id);

    // Private to the searcher: the actual clues found (or none, if the room was
    // a dead end for them).
    cb?.({ ok: true, room: result.room, revealed: result.revealed });

    // Ambient, location-free note to BOTH players (privacy: no room, no clue).
    io.to(room.code).emit("chat", {
      who: me.name,
      character: me.character,
      text: "is examining something…",
      kind: "ambient",
    });

    // Counts changed — push fresh per-player views so the clue tracker updates.
    for (const p of room.players) io.to(p.id).emit("state:update", room.viewFor(p.id));
  });
}
