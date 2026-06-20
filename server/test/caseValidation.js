// Verifies the case validator (shared/caseSchema.js) against the baked fallback
// case and against deliberately broken variants. No server needed — pure logic.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateCase } from "../../shared/caseSchema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = async () =>
  JSON.parse(await readFile(join(__dirname, "../ai/fallbackCase.json"), "utf8"));
const clone = (o) => JSON.parse(JSON.stringify(o));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${label}`);
  if (!cond) failures++;
};

const base = await load();

console.log("\n[1] The baked fallback case is valid and solvable by both players.");
{
  const res = validateCase(base);
  check("fallback case passes validateCase()", res.ok === true);
  if (!res.ok) console.log("      reasons:", res.reasons);
}

console.log("\n[2] A clue that eliminates the true culprit is rejected.");
{
  const bad = clone(base);
  bad.clues.player1_private[0].eliminates.suspects.push(base.solution.culprit_id);
  const res = validateCase(bad);
  check("tampered case is rejected", res.ok === false);
  check("reason mentions the true culprit", res.reasons.some((r) => /true culprit/i.test(r)));
}

console.log("\n[3] Removing an elimination so a player can't narrow down is rejected.");
{
  const bad = clone(base);
  bad.clues.player2_private[2].eliminates.suspects = []; // p2 can no longer clear s5
  const res = validateCase(bad);
  check("under-determined case is rejected", res.ok === false);
  check("reason mentions unique deduction", res.reasons.some((r) => /uniquely deduce/i.test(r)));
}

console.log("\n[4] Wrong clue counts are rejected.");
{
  const bad = clone(base);
  bad.clues.shared.pop(); // 2 shared instead of 3
  const res = validateCase(bad);
  check("bad distribution is rejected", res.ok === false);
  check("reason mentions shared count", res.reasons.some((r) => /shared clues/i.test(r)));
}

console.log("\n[5] A 'red herring' that doesn't contradict the solution is rejected.");
{
  const bad = clone(base);
  bad.clues.red_herrings_p1[0].eliminates = { suspects: ["s1"], weapons: [], rooms: [] };
  const res = validateCase(bad);
  check("inert herring is rejected", res.ok === false);
  check("reason mentions herring", res.reasons.some((r) => /herring/i.test(r)));
}

console.log("\n[6] A suspect missing a dialogue answer is rejected.");
{
  const bad = clone(base);
  delete bad.dialogue_trees.s2.questions.motive;
  const res = validateCase(bad);
  check("missing question answer is rejected", res.ok === false);
  check("reason mentions the question", res.reasons.some((r) => /question "motive"/i.test(r)));
}

console.log("\n[7] A suspect with no evidence tell is rejected.");
{
  const bad = clone(base);
  bad.dialogue_trees.s4.evidence_responses = {};
  const res = validateCase(bad);
  check("missing tell is rejected", res.ok === false);
  check("reason mentions evidence response", res.reasons.some((r) => /evidence response/i.test(r)));
}

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED ✓" : failures + " CHECK(S) FAILED ✗"} ===`);
process.exit(failures === 0 ? 0 : 1);
