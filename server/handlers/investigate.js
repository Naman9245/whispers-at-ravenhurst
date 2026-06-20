// SERVER-AUTHORITATIVE examination (Phase 2.2 hotspot system).
// The player examines ONE hotspot in the room they're standing in; the server
// returns the clue placed there for THIS player (if any) or nothing. The
// hotspot→clue mapping never leaves the server until this exact spot is examined.
// The opponent only ever gets a vague, location-free ambient note.
export function registerInvestigate(io, socket, store) {
  socket.on("hotspot:examine", ({ hotspotId } = {}, cb) => {
    const room = store.roomOf(socket);
    if (!room) return cb?.({ ok: false, error: "Not in a room." });

    const result = room.tryExamine(socket.id, hotspotId);
    if (!result.ok) return cb?.(result);

    const me = room.player(socket.id);

    // Private to the examiner: the hotspot result (a clue, or "nothing found").
    cb?.(result);

    // Ambient, location-free note to BOTH players (privacy: no room, no hotspot, no clue).
    io.to(room.code).emit("chat", {
      who: me.name,
      character: me.character,
      text: "is examining something…",
      kind: "ambient",
    });

    // Counts/examined changed — push fresh per-player views so the trackers update.
    for (const p of room.players) io.to(p.id).emit("state:update", room.viewFor(p.id));
  });
}
