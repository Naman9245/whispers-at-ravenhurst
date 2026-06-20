// Case JSON shape + the solvability validator.
//
// A case is solvable when each detective, using ONLY the shared clues plus their
// OWN private clues, can eliminate every suspect/weapon/room except the true one.
// Clues carry machine-checkable eliminations so this is a real check, not a guess:
//
//   clue.eliminates = { suspects:[ids], weapons:[ids], rooms:[ids] }
//
// A player "solves" when the survivors (candidates not eliminated by any of their
// clues) are exactly one suspect, one weapon, one room — and they match solution.
// Red herrings are NOT counted toward solving; a fair herring actively contradicts
// the solution (so it's exposed as false once the real clues are in).
//
// Expected case shape:
//   { case_id, map, narrative, solution:{ culprit_id, weapon_id, room_id },
//     suspects:[...6], weapons:[...6],
//     clues:{ shared:[3], player1_private:[4], player2_private:[4],
//             red_herrings_p1:[1], red_herrings_p2:[1] },
//     validation:{...} }
import { CLUE_DISTRIBUTION, SUSPECT_COUNT, WEAPON_COUNT } from "./constants.js";
import { ROOM_IDS } from "./mapData.js";
import { QUESTION_IDS } from "./questions.js";

// Union of eliminated ids in one category across a list of clues.
function eliminatedSet(clues, category) {
  const out = new Set();
  for (const clue of clues) {
    for (const id of clue?.eliminates?.[category] || []) out.add(id);
  }
  return out;
}

// Survivors = candidates not eliminated by any of the given clues.
function survivors(clues, suspectIds, weaponIds) {
  const es = eliminatedSet(clues, "suspects");
  const ew = eliminatedSet(clues, "weapons");
  const er = eliminatedSet(clues, "rooms");
  return {
    suspects: suspectIds.filter((id) => !es.has(id)),
    weapons: weaponIds.filter((id) => !ew.has(id)),
    rooms: ROOM_IDS.filter((id) => !er.has(id)),
  };
}

/**
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function validateCase(caseData) {
  const reasons = [];
  const fail = (m) => reasons.push(m);

  if (!caseData || typeof caseData !== "object") {
    return { ok: false, reasons: ["case is missing or not an object"] };
  }

  const { solution, suspects, weapons, clues } = caseData;
  const suspectIds = Array.isArray(suspects) ? suspects.map((s) => s.id) : [];
  const weaponIds = Array.isArray(weapons) ? weapons.map((w) => w.id) : [];

  // ---- structural / counts ------------------------------------------------
  if (suspectIds.length !== SUSPECT_COUNT) fail(`expected ${SUSPECT_COUNT} suspects, got ${suspectIds.length}`);
  if (weaponIds.length !== WEAPON_COUNT) fail(`expected ${WEAPON_COUNT} weapons, got ${weaponIds.length}`);

  if (!solution) {
    fail("missing solution");
  } else {
    if (!suspectIds.includes(solution.culprit_id)) fail(`solution culprit "${solution.culprit_id}" is not a listed suspect`);
    if (!weaponIds.includes(solution.weapon_id)) fail(`solution weapon "${solution.weapon_id}" is not a listed weapon`);
    if (!ROOM_IDS.includes(solution.room_id)) fail(`solution room "${solution.room_id}" is not a map room`);
  }

  const c = clues || {};
  const d = CLUE_DISTRIBUTION;
  const checkLen = (arr, n, label) => {
    if (!Array.isArray(arr) || arr.length !== n) fail(`${label}: expected ${n}, got ${Array.isArray(arr) ? arr.length : 0}`);
  };
  checkLen(c.shared, d.shared, "shared clues");
  checkLen(c.player1_private, d.privatePerPlayer, "player1_private clues");
  checkLen(c.player2_private, d.privatePerPlayer, "player2_private clues");
  checkLen(c.red_herrings_p1, d.redHerringPerPlayer, "red_herrings_p1");
  checkLen(c.red_herrings_p2, d.redHerringPerPlayer, "red_herrings_p2");

  // Bail before the deduction pass if the shape is wrong — it would throw.
  if (reasons.length) return { ok: false, reasons };

  // ---- per-player solvability (shared + own private, herrings excluded) ---
  const realByPlayer = {
    "player 1": [...c.shared, ...c.player1_private],
    "player 2": [...c.shared, ...c.player2_private],
  };
  for (const [label, list] of Object.entries(realByPlayer)) {
    const s = survivors(list, suspectIds, weaponIds);
    if (s.suspects.length !== 1 || s.weapons.length !== 1 || s.rooms.length !== 1) {
      fail(
        `${label} cannot uniquely deduce a triple — survivors: ` +
          `suspects[${s.suspects}] weapons[${s.weapons}] rooms[${s.rooms}]`
      );
      continue;
    }
    if (s.suspects[0] !== solution.culprit_id) fail(`${label} deduces culprit "${s.suspects[0]}", not the solution`);
    if (s.weapons[0] !== solution.weapon_id) fail(`${label} deduces weapon "${s.weapons[0]}", not the solution`);
    if (s.rooms[0] !== solution.room_id) fail(`${label} deduces room "${s.rooms[0]}", not the solution`);
  }

  // ---- real clues must never contradict the solution ----------------------
  const realAll = [...c.shared, ...c.player1_private, ...c.player2_private];
  for (const clue of realAll) {
    if ((clue.eliminates?.suspects || []).includes(solution.culprit_id)) fail(`clue "${clue.id}" wrongly eliminates the true culprit`);
    if ((clue.eliminates?.weapons || []).includes(solution.weapon_id)) fail(`clue "${clue.id}" wrongly eliminates the true weapon`);
    if ((clue.eliminates?.rooms || []).includes(solution.room_id)) fail(`clue "${clue.id}" wrongly eliminates the true room`);
  }

  // ---- red herrings must be genuine false leads ---------------------------
  for (const [label, list] of [["red_herrings_p1", c.red_herrings_p1], ["red_herrings_p2", c.red_herrings_p2]]) {
    for (const clue of list) {
      const contradictsSolution =
        (clue.eliminates?.suspects || []).includes(solution.culprit_id) ||
        (clue.eliminates?.weapons || []).includes(solution.weapon_id) ||
        (clue.eliminates?.rooms || []).includes(solution.room_id);
      if (!contradictsSolution) fail(`${label} clue "${clue.id}" is not a real herring — it never contradicts the solution`);
    }
  }

  // ---- dialogue trees: every suspect questionable, with a catchable tell ---
  const trees = caseData.dialogue_trees || {};
  const allClueIds = new Set(realAll.concat(c.red_herrings_p1, c.red_herrings_p2).map((cl) => cl.id));
  for (const sid of suspectIds) {
    const tree = trees[sid];
    if (!tree) { fail(`suspect "${sid}" has no dialogue tree`); continue; }
    for (const qid of QUESTION_IDS) {
      const ans = tree.questions?.[qid];
      if (typeof ans !== "string" || ans.length === 0) fail(`suspect "${sid}" has no answer for question "${qid}"`);
    }
    const responses = tree.evidence_responses || {};
    const responseKeys = Object.keys(responses);
    if (responseKeys.length === 0) fail(`suspect "${sid}" has no evidence response (needs at least one catchable tell)`);
    for (const cid of responseKeys) {
      if (!allClueIds.has(cid)) fail(`suspect "${sid}" evidence_response keyed to unknown clue "${cid}"`);
      if (!responses[cid]?.tell) fail(`suspect "${sid}" evidence_response "${cid}" has no behavioral tell`);
    }
  }

  return { ok: reasons.length === 0, reasons: reasons.length ? reasons : ["valid"] };
}
