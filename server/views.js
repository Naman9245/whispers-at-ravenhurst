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
    victimBackstory: caseData.narrative?.victim_backstory,
    // The dossier the detectives are entitled to: physical description and a
    // practical note. These are DELIBERATELY discriminating — the clues describe
    // what the killer was (left-handed, took the stairs at speed) and the player
    // crosses names off by reading these. Safe to publish: they say nothing about
    // the solution that the clue set does not already prove, and `clue.eliminates`
    // remains the machine-checkable truth. See shared/caseSchema.js.
    suspects: (caseData.suspects || []).map((s) => ({
      id: s.id, name: s.name, role: s.role, blurb: s.blurb,
      age: s.age, height: s.height, build: s.build, occupation: s.occupation,
      handedness: s.handedness, note: s.note,
    })),
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
    // Host-chosen settings the client needs to render correctly. The gameplay
    // toggles are advisory for the UI only — `rivalProgress` is enforced below,
    // at the boundary, not by asking the client to look away.
    settings: {
      softTimer: room.settings.softTimer,
      hotspotMarkers: room.settings.hotspotMarkers,
      sprint: room.settings.sprint,
      rivalProgress: room.settings.rivalProgress,
    },
    playersOnline: room.players.length,
    progressTotal: room.progressTotal(),
    caseInfo: publicCase(room.caseData),

    // Accusation phase: timing + lock-in FLAGS only. Never the opponent's
    // chosen culprit/weapon/room/clues — those appear solely in the reveal.
    accusation: {
      now: Date.now(),                       // server clock, for countdown sync
      startedAt: room.startedAt,
      opensAt: room.startedAt ? room.accuseOpensAt() : null,
      // null (not 0) when the host chose Timer: Off. 0 would read as "the game
      // ended the moment it started" — the client derives its end time from
      // startedAt + softMs, so a zero here freezes the ACCUSE pill at 0:00.
      softMs: room.timers.softTimer == null ? null : room.timers.softTimer * 1000,
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
      examinedHotspots: me.examinedHotspots, // hotspot ids this player has examined
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
          // "Rival progress: Hidden" is withheld HERE rather than hidden in the
          // client. Shipping the number and styling it away would be a two-click
          // devtools cheat, and this file is the one privacy boundary.
          clueCount: room.settings.rivalProgress ? room.progressCount(opp) : null,
          lockedIn: opp.lockedIn,
          connected: opp.connected,
        }
      : null,
  };
}
