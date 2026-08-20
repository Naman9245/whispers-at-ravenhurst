// Interrogation system (per-suspect questions, clue unlocks, lies, budget).
//
// Needs a running server: WHISPERS_FAST_TIMERS=1 node server/index.js
//
// Covers the mechanics that turn questioning from a quiz into detective work:
//   • each suspect has their OWN question set; another suspect's is refused
//   • clue-gated questions are refused server-side until the clue is FOUND
//     (the client filters its list, but that list is only advisory)
//   • core questions spend the budget; clue-unlocked ones are free
//   • a suspect LIES until confronted, then their answer changes — and the
//     collapsed question becomes re-askable exactly once
import { io } from "socket.io-client";
import { ROOM_HOTSPOTS } from "../../shared/roomHotspots.js";
import { CORE_QUESTION_IDS, SUSPECT_QUESTIONS, questionsFor } from "../../shared/suspectQuestions.js";
import { QUESTION_CAP } from "../../shared/constants.js";

const URL = "http://localhost:3001";
const ask = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));
const wait = (s, ev) => new Promise((r) => s.once(ev, r));
let failures = 0;
const check = (label, cond) => { console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${label}`); if (!cond) failures++; };

const A = io(URL, { forceNew: true });
const B = io(URL, { forceNew: true });
await Promise.all([wait(A, "connect"), wait(B, "connect")]);

const startA = wait(A, "game:start");
const created = await ask(A, "room:create", { name: "Holmes", devMode: true });
await ask(B, "room:join", { code: created.code, name: "Watson" });
await startA;

console.log("\n[1] Each suspect has their OWN question set.");
check(`s3 offers ${questionsFor("s3").length} questions (12 core + 15 own)`, questionsFor("s3").length === 27);
const foreign = await ask(A, "suspect:ask", { suspectId: "s3", questionId: SUSPECT_QUESTIONS.s1[0].id });
check("s1's own question is REJECTED when put to s3", foreign.ok === false);
const ownQ = SUSPECT_QUESTIONS.s3.find((q) => !q.requiresClue);
const okOwn = await ask(A, "suspect:ask", { suspectId: "s3", questionId: ownQ.id });
check(`s3's own question is accepted ("${ownQ.text.slice(0, 40)}…")`, okOwn.ok === true && okOwn.answer.length > 0);

console.log("\n[2] ANTI-CHEAT: clue-gated questions are refused until the clue is found.");
const gated = SUSPECT_QUESTIONS.s3.find((q) => q.requiresClue === "shared-3");
const denied = await ask(A, "suspect:ask", { suspectId: "s3", questionId: gated.id });
check("gated question refused before the clue is found", denied.ok === false && denied.locked === true);
console.log(`      server said: "${denied.error}"`);

console.log("\n[3] Finding the clue unlocks it — and asking it is FREE.");
await ask(A, "region:enter", { room: "study" });
const ex = await ask(A, "hotspot:examine", { hotspotId: "study_desk" });   // yields shared-3
check("Holmes examines the study desk and finds shared-3", ex.ok === true && ex.found === true && ex.clue.id === "shared-3");
const st1 = await ask(A, "state:request", {});
const spentBefore = st1.view.you.questioning.s3.asked;
const unlocked = await ask(A, "suspect:ask", { suspectId: "s3", questionId: gated.id });
check("gated question now accepted", unlocked.ok === true && unlocked.answer.length > 0);
check("and it was FREE (marked free, budget unchanged)", unlocked.free === true);
const st2 = await ask(A, "state:request", {});
check(`budget did not move (${spentBefore} -> ${st2.view.you.questioning.s3.asked})`,
  st2.view.you.questioning.s3.asked === spentBefore);

console.log("\n[4] THE LIE, part one: ask before there is any evidence to break it.");
// Asked BEFORE the budget is exhausted — s3_lounge costs a normal ask; only the
// later RE-ask, after his story collapses, is free.
const before = await ask(A, "suspect:ask", { suspectId: "s3", questionId: "s3_lounge" });
check("s3_lounge answered", before.ok === true);
check("the first answer is the LIE (not yet broken)", before.broke === false);
console.log(`      lie:   "${before.answer.slice(0, 72)}…"`);

console.log("\n[5] Core questions DO spend the budget, and the cap holds.");
let capped = false;
for (const qid of CORE_QUESTION_IDS) {
  const r = await ask(A, "suspect:ask", { suspectId: "s3", questionId: qid });
  if (r.capped) { capped = true; break; }
}
// Assert against the SERVER's count, not a local tally — the budget is the
// server's business and a local counter just drifts.
check(`refused further budget questions once ${QUESTION_CAP} were spent`, capped === true);
const st3 = await ask(A, "state:request", {});
check(`view reports ${QUESTION_CAP}/${QUESTION_CAP} core spent`, st3.view.you.questioning.s3.asked === QUESTION_CAP);
check("askedIds is a list, so the UI can grey out used questions",
  Array.isArray(st3.view.you.questioning.s3.askedIds) && st3.view.you.questioning.s3.askedIds.length > QUESTION_CAP);

console.log("\n[6] THE LIE, part two: confront him and the story collapses.");
const conf = await ask(A, "suspect:confront", { suspectId: "s3", clueId: "shared-3" });
check("confronting Vale with shared-3 succeeds", conf.ok === true);
const st4 = await ask(A, "state:request", {});
check("view now lists s3_lounge as re-askable", (st4.view.you.questioning.s3.reAskable || []).includes("s3_lounge"));
const after = await ask(A, "suspect:ask", { suspectId: "s3", questionId: "s3_lounge" });
check("re-asking is allowed and the answer CHANGED", after.ok === true && after.broke === true && after.answer !== before.answer);
console.log(`      truth: "${after.answer.slice(0, 72)}…"`);
const again = await ask(A, "suspect:ask", { suspectId: "s3", questionId: "s3_lounge" });
check("but only once — a second re-ask is refused", again.ok === false);

console.log("\n[6b] The CORE loop: a clue points at a core question, and breaks its answer.");
// This is the point of the evidence rewrite. The mud clue says the killer had been
// outside; "Did you step outside this evening?" is a core question every suspect
// answers; Vale says no; putting the mud to him collapses it. Before this, his core
// answers were flat lies with nothing in the game able to test them, so the clue
// pointed at a question whose answer could never be checked.
const C1 = io(URL, { forceNew: true });
const C2 = io(URL, { forceNew: true });
await Promise.all([wait(C1, "connect"), wait(C2, "connect")]);
const room2 = await ask(C1, "room:create", { name: "Lestrade", devMode: true });
const c1start = wait(C1, "game:start");
await ask(C2, "room:join", { code: room2.code, name: "Gregson" });
await c1start;

const lie = await ask(C1, "suspect:ask", { suspectId: "s3", questionId: "leaving" });
check("Vale answers the core 'did you step outside' question", lie.ok === true);
check("and it is the LIE", lie.broke === false);

// Find the mud for real rather than hardcoding which hotspot holds it.
let mudFound = false;
for (const room of ["dining", "library", "study", "lounge", "kitchen", "conservatory"]) {
  await ask(C1, "region:enter", { room, inCorridor: false });
  for (const h of ROOM_HOTSPOTS[room] || []) {
    const r = await ask(C1, "hotspot:examine", { hotspotId: h.id });
    if (r.ok && r.found && r.clue && r.clue.id === "shared-1") { mudFound = true; break; }
  }
  if (mudFound) break;
}
check("the mud clue is findable", mudFound === true);

const put = await ask(C1, "suspect:confront", { suspectId: "s3", clueId: "shared-1" });
check("the mud can be put to him", put.ok === true);
const truth = await ask(C1, "suspect:ask", { suspectId: "s3", questionId: "leaving" });
check("his story collapses and the answer changes", truth.ok === true && truth.broke === true && truth.answer !== lie.answer);
console.log(`      was:  "${String(lie.answer).slice(0, 64)}…"`);
console.log(`      now:  "${String(truth.answer).slice(0, 64)}…"`);
C1.close(); C2.close();

console.log("\n[7] PRIVACY: no dialogue tree, lie variant or unheard answer in the view.");
const blob = JSON.stringify(st4.view);
check("no 'afterConfront' in the view", !blob.includes("afterConfront"));
check("no 'brokenBy' in the view", !blob.includes("brokenBy"));
check("no 'dialogue_trees' in the view", !blob.includes("dialogue_trees"));
check("no unheard answer prose leaked (e.g. Holloway's cravat line)", !blob.includes("I have counted for thirty years"));

console.log(`\n=== INTERROGATION: ${failures === 0 ? "ALL PASSED ✓" : failures + " FAILED ✗"} ===`);
A.close(); B.close();
process.exit(failures === 0 ? 0 : 1);
