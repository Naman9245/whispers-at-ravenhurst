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
//
// ⚠️ The null guard is load-bearing, not defensive. With Timer: Off the host has
// chosen `softTimer: null`, and `null * 1000` is 0 — so without this the max()
// yields 0 and setTimeout fires on the next tick, revealing the solution the
// instant the second player joins. The exact inverse of the setting.
//
// Timer: Off still terminates: the first lock-in arms _windowTimer below, so the
// game simply has no wall clock until somebody accuses.
export function scheduleForceResolve(io, room) {
  if (room.timers.softTimer == null) return;   // Timer: Off — never force-resolve
  const ms = Math.max(0, room.timers.softTimer * 1000 - (Date.now() - room.startedAt));
  room._softTimer = setTimeout(() => resolveGame(io, room), ms);
}

export function registerAccusation(io, socket, store) {
  // "I have read the case file." Once BOTH detectives say so, play begins and the
  // soft cap is re-armed against the new origin — otherwise the briefing would eat
  // the clock, which in Dev Mode meant the game resolved itself mid-story.
  socket.on("case:ready", (_payload, cb) => {
    const room = store.roomOf(socket);
    if (!room) return cb?.({ ok: false, error: "Not in a room." });
    const began = room.markReady(socket.id);
    if (began) {
      clearTimeout(room._softTimer);
      room._softTimer = null;
      scheduleForceResolve(io, room);
      console.log(`[lobby] room ${room.code} — both briefed, clock starts now`);
    }
    for (const p of room.players) io.to(p.id).emit("state:update", room.viewFor(p.id));
    cb?.({ ok: true, began });
  });


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
