// Accusation endgame (Phase 1 step 10). The server owns the clock and the truth.
// Flow: ACCUSE is gated until accuseGate passes; the first lock-in starts the
// opponent's window; the game resolves when both have locked in, when that window
// closes (auto-forfeit), or when the soft timer expires with no lock-ins. The
// solution + scoring + both accusations are revealed ONLY at resolution.
import { onIntent } from "../intent.js";

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

// Play begins (both detectives briefed, or the briefing ran out): the clock
// starts from NOW, and the soft cap is armed against that origin — not against
// the join, or the briefing would eat the clock, which in Dev Mode meant the game
// resolved itself mid-story. Returns true if this call started play.
export function beginPlay(io, room) {
  if (!room.beginPlay()) return false;
  clearTimeout(room._softTimer);
  room._softTimer = null;
  scheduleForceResolve(io, room);
  for (const p of room.players) io.to(p.id).emit("state:update", room.viewFor(p.id));
  console.log(`[lobby] room ${room.code} — briefing over, clock starts now`);
  return true;
}

// Armed when the game starts: whoever is still reading when the briefing runs
// out is brought in anyway, so one idle player cannot stall the other forever.
export function armBriefing(io, room) {
  clearTimeout(room._briefingTimer);
  const ms = Math.max(0, (room.briefingEndsAt ?? Date.now()) - Date.now());
  room._briefingTimer = setTimeout(() => beginPlay(io, room), ms);
}

// Resolve as soon as every detective still in the game has locked in. With both
// present that is the familiar "both in → reveal"; if one has walked away, the
// one who stayed and accused should not sit out a final window meant for nobody.
function resolveIfAllLocked(io, room) {
  if (room.status === "playing" && room.players.length > 0 && room.players.every((p) => p.accusation)) {
    resolveGame(io, room);
  }
}

// A detective has left for good (explicit exit, or their reconnect window ran
// out). Whatever the game was waiting on them for must not wait forever.
export function settleAfterDeparture(io, room) {
  if (room.status !== "playing" || room.players.length === 0) return;
  if (!room.playStarted && room.players.every((p) => p.ready)) beginPlay(io, room);
  resolveIfAllLocked(io, room);
}

export function registerAccusation(io, socket, store) {
  // "I have read the case file." Once BOTH detectives say so, play begins.
  onIntent(socket, "case:ready", (_payload, cb) => {
    const room = store.roomOf(socket);
    if (!room) return cb({ ok: false, error: "Not in a room." });
    const began = room.markReady(socket.id) && beginPlay(io, room);
    // beginPlay already pushed fresh views; otherwise the rival still needs to
    // hear that this detective is ready.
    if (!began) for (const p of room.players) io.to(p.id).emit("state:update", room.viewFor(p.id));
    cb({ ok: true, began });
  });


  onIntent(socket, "accuse:lock", (payload, cb) => {
    const room = store.roomOf(socket);
    if (!room) return cb({ ok: false, error: "Not in a room." });

    const result = room.tryLock(socket.id, payload);
    if (!result.ok) return cb(result);

    const me = room.player(socket.id);
    cb({ ok: true });

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

    // Everyone in → resolve immediately.
    resolveIfAllLocked(io, room);
  });
}
