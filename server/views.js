// THE PRIVACY BOUNDARY. buildView() is the only thing that turns server state
// into something sent to a client. It exposes the requesting player's own data
// in full, but reduces the opponent to {name, character, clueCount, lockedIn}.
// It NEVER includes: opponent room, opponent clue contents, opponent notebook,
// or the case solution.
import { MAP_ID, ROOMS } from "../shared/mapData.js";

// Strip the case down to PUBLIC facts only: the cast list and victim flavor that
// both detectives are entitled to see. Deliberately omits the solution, every
// clue (text + eliminations), and the red herrings — those stay server-side.
function publicCase(caseData) {
  if (!caseData) return null;
  return {
    caseId: caseData.case_id,
    victimName: caseData.narrative?.victim_name,
    opening: caseData.narrative?.opening,
    suspects: (caseData.suspects || []).map((s) => ({ id: s.id, name: s.name, role: s.role, blurb: s.blurb })),
    weapons: (caseData.weapons || []).map((w) => ({ id: w.id, name: w.name })),
    rooms: Object.entries(ROOMS).map(([id, r]) => ({ id, label: r.label })),
  };
}

export function buildView(room, playerId) {
  const me = room.player(playerId);
  const opp = room.opponentOf(playerId);

  return {
    roomCode: room.code,
    status: room.status,             // "lobby" | "playing" | "ended"
    devMode: room.devMode,
    map: MAP_ID,
    timers: room.timers,
    playersOnline: room.players.length,
    progressTotal: room.progressTotal(),
    caseInfo: publicCase(room.caseData),

    // Accusation phase: timing + lock-in FLAGS only. Never the opponent's
    // chosen culprit/weapon/room/clues — those appear solely in the reveal.
    accusation: {
      now: Date.now(),                       // server clock, for countdown sync
      startedAt: room.startedAt,
      opensAt: room.startedAt ? room.accuseOpensAt() : null,
      softMs: room.timers.softTimer * 1000,
      windowMs: room.timers.opponentWindow * 1000,
      finalDeadline: room.finalDeadline,     // set once someone locks in
      youLocked: Boolean(me?.accusation),
      opponentLocked: Boolean(opp?.accusation),
    },

    // Full detail for the requesting player only.
    you: me && {
      character: me.character,
      name: me.name,
      room: me.room,                       // private to this client
      inCorridor: me.inCorridor,           // in the corridor (can't investigate)
      clues: me.clues,                     // private clue ids found so far
      foundClues: room.foundCluesFor(me),  // full clue objects for the notebook
      clueCount: room.progressCount(me),   // non-herring count for the tracker
      investigated: me.investigated,       // rooms already searched (button state)
      questioning: room.questioningStateFor(me), // per-suspect asked/confronted (own)
      lockedIn: me.lockedIn,
      connected: me.connected,
    },

    // Opponent: counts + flags ONLY. No position, no clue contents. The count is
    // normalized (herrings excluded) so it leaks nothing beyond progress.
    opponent: opp
      ? {
          name: opp.name,
          character: opp.character,
          clueCount: room.progressCount(opp),
          lockedIn: opp.lockedIn,
          connected: opp.connected,
        }
      : null,
  };
}
