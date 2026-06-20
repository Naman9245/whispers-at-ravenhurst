// Accusation endgame (Phase 1 step 10). The server owns the clock and the truth.
// Flow: ACCUSE is gated until accuseGate passes; the first lock-in starts the
// opponent's window; the game resolves when both have locked in, when that window
// closes (auto-forfeit), or when the soft timer expires with no lock-ins. The
// solution + scoring + both accusations are revealed ONLY at resolution.

function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Resolve once and push the reveal + a final state to both players.
export function resolveGame(io, room) {
  const reveal = room.resolve(); // null if already ended
  if (!reveal) return;
  for (const p of room.players) {
    io.to(p.id).emit("game:reveal", reveal);
    io.to(p.id).emit("state:update", room.viewFor(p.id));
  }
  console.log(`[accuse] room ${room.code} resolved — winners: ${reveal.winners.join(", ") || "none"}`);
}

// Soft cap: if nobody has locked in by softTimer, force resolution (forfeits).
export function scheduleForceResolve(io, room) {
  const ms = Math.max(0, room.timers.softTimer * 1000 - (Date.now() - room.startedAt));
  room._softTimer = setTimeout(() => resolveGame(io, room), ms);
}

export function registerAccusation(io, socket, store) {
  socket.on("accuse:lock", (payload, cb) => {
    const room = store.roomOf(socket);
    if (!room) return cb?.({ ok: false, error: "Not in a room." });

    const result = room.tryLock(socket.id, payload || {});
    if (!result.ok) return cb?.(result);

    const me = room.player(socket.id);
    cb?.({ ok: true });

    // First lock-in: cancel the soft cap and open the opponent's final window.
    if (room.lockedCount() === 1) {
      clearTimeout(room._softTimer);
      room._softTimer = null;
      room.startFinalWindow();
      room._windowTimer = setTimeout(() => resolveGame(io, room), room.timers.opponentWindow * 1000);
      io.to(room.code).emit("chat", {
        who: me.name,
        character: me.character,
        text: `has locked in their accusation. The other detective has ${fmtClock(room.timers.opponentWindow)} to respond.`,
        kind: "system",
      });
    }

    // Refresh both views (lock flags + finalDeadline) — but no choices.
    for (const p of room.players) io.to(p.id).emit("state:update", room.viewFor(p.id));

    // Both in → resolve immediately.
    if (room.lockedCount() === 2) resolveGame(io, room);
  });
}
