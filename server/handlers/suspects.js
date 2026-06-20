// Suspect questioning (Phase 1 step 8). GLOBAL — a detective may question any
// suspect from anywhere; no room-binding. The server enforces the per-suspect
// question budget, serves ONE dialogue branch at a time (never the whole tree),
// and tells the opponent nothing but a vague ambient note.
export function registerSuspects(io, socket, store) {
  // Generic pool question → one answer branch.
  socket.on("suspect:ask", ({ suspectId, questionId } = {}, cb) => {
    const room = store.roomOf(socket);
    if (!room) return cb?.({ ok: false, error: "Not in a room." });

    const result = room.tryAsk(socket.id, suspectId, questionId);
    if (!result.ok) return cb?.(result);

    const me = room.player(socket.id);
    cb?.(result); // private to the asker: the answer + their budget

    // Ambient, content-free note to BOTH players (no suspect, no question, no answer).
    io.to(room.code).emit("chat", { who: me.name, character: me.character, text: "is questioning someone…", kind: "ambient" });
    for (const p of room.players) io.to(p.id).emit("state:update", room.viewFor(p.id));
  });

  // Confront with a found clue → an evidence branch (possibly a behavioral tell).
  socket.on("suspect:confront", ({ suspectId, clueId } = {}, cb) => {
    const room = store.roomOf(socket);
    if (!room) return cb?.({ ok: false, error: "Not in a room." });

    const result = room.tryConfront(socket.id, suspectId, clueId);
    if (!result.ok) return cb?.(result);

    const me = room.player(socket.id);
    cb?.(result); // private to the asker: the response + tell

    io.to(room.code).emit("chat", { who: me.name, character: me.character, text: "produces something, and watches a face change…", kind: "ambient" });
    for (const p of room.players) io.to(p.id).emit("state:update", room.viewFor(p.id));
  });
}
