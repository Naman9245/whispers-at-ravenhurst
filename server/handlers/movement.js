// SERVER-AUTHORITATIVE region tracking. The client free-roams in pixel space and
// reports the room it has entered (or that it has stepped into the corridor). The
// server validates room changes against the connection graph and pushes vague,
// location-free notes to both players. Positions themselves are never broadcast.
export function registerMovement(io, socket, store) {
  socket.on("region:enter", ({ room, inCorridor } = {}, cb) => {
    const gameRoom = store.roomOf(socket);
    if (!gameRoom) return cb?.({ ok: false, error: "Not in a room." });

    const result = gameRoom.setRegion(socket.id, { room, inCorridor });
    if (!result.ok) return cb?.(result);

    const me = gameRoom.player(socket.id);
    cb?.(result);

    // Only a genuine room change is worth a (vague) note; corridor steps are silent.
    if (result.changedRoom) {
      io.to(gameRoom.code).emit("chat", {
        who: me.name,
        character: me.character,
        text: "moved to another room…",
        kind: "move",
      });
    }
    for (const p of gameRoom.players) io.to(p.id).emit("state:update", gameRoom.viewFor(p.id));
  });
}
