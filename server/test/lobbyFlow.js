// Boots two socket.io clients against the running server to verify the Step 2
// deliverables end-to-end: create/join, auto-start, server-authoritative
// movement (valid + rejected), and the privacy boundary (no opponent position).
import { io } from "socket.io-client";
import { QUESTION_IDS } from "../../shared/questions.js";

const URL = "http://localhost:3001";
const log = (...a) => console.log(...a);
const ask = (sock, ev, payload) => new Promise((res) => sock.emit(ev, payload, res));
const wait = (sock, ev) => new Promise((res) => sock.once(ev, res));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(label, cond) {
  log(`${cond ? "  ✓" : "  ✗ FAIL"} ${label}`);
  if (!cond) failures++;
}

const A = io(URL, { forceNew: true });
const B = io(URL, { forceNew: true });

await Promise.all([wait(A, "connect"), wait(B, "connect")]);
log("\n[1] Both clients connected.");

// --- create + join ---
const startA = wait(A, "game:start");
const created = await ask(A, "room:create", { name: "Sherlock", devMode: true });
log(`\n[2] Holmes created room → code ${created.code} (dev=${created.view.devMode})`);
check("create ok", created.ok === true);
check("creator is holmes", created.view.you.character === "holmes");
check("creator starts in study", created.view.you.room === "study");

const startB = wait(B, "game:start");
const joined = await ask(B, "room:join", { code: created.code, name: "John" });
log(`[3] Watson joined room ${joined.code}`);
check("join ok", joined.ok === true);
check("joiner is watson", joined.view.you.character === "watson");

const [viewA, viewB] = await Promise.all([startA, startB]);
log("\n[4] game:start received by both. Status:", viewA.status);
check("game started (playing)", viewA.status === "playing" && viewB.status === "playing");
check("both see 2 players online", viewA.playersOnline === 2 && viewB.playersOnline === 2);
check("progress total is 7", viewA.progressTotal === 7);
check("A sees opponent = John, count 0", viewA.opponent?.name === "John" && viewA.opponent?.clueCount === 0);

// --- PRIVACY: opponent object must not leak position ---
log("\n[5] Privacy check on the view payloads:");
check("A's opponent has NO room field", viewA.opponent && !("room" in viewA.opponent));
check("B's opponent has NO room field", viewB.opponent && !("room" in viewB.opponent));
check("no 'solution' anywhere in A's view", !JSON.stringify(viewA).includes("solution"));

// --- PRIVACY: the loaded case must not leak its secrets through the view ---
log("\n[5b] Case-secret privacy (case is now generated at start):");
const blobA = JSON.stringify(viewA).toLowerCase();
check("view exposes public caseInfo (cast + victim)", !!viewA.caseInfo && viewA.caseInfo.suspects?.length === 6);
check("caseInfo carries victim name", viewA.caseInfo?.victimName === "Lord Edmund Ashworth");
check("no 'culprit' in the view", !blobA.includes("culprit"));
check("no 'eliminates' (clue logic) in the view", !blobA.includes("eliminates"));
check("no 'red_herring' in the view", !blobA.includes("red_herring"));
check("no clue text leaked (e.g. 'mud is tracked')", !blobA.includes("mud is tracked"));

// --- server-authoritative region tracking: every room reachable via corridor ---
log("\n[6] Region tracking — any room is reachable via the corridor; bad ids rejected.");
const m1 = await ask(A, "region:enter", { room: "library" });
check("study → library allowed", m1.ok === true && m1.room === "library" && m1.changedRoom === true);

const m2 = await ask(A, "region:enter", { room: "lounge" });    // non-adjacent in the old graph — now reachable
check("library → lounge allowed (corridor connects all rooms)", m2.ok === true && m2.room === "lounge");

const mBad = await ask(A, "region:enter", { room: "ballroom" }); // not a real room
check("entering a non-existent room is REJECTED", mBad.ok === false && /no such room/i.test(mBad.error));
log(`      server said: "${mBad.error}"`);

const m3 = await ask(A, "region:enter", { room: "kitchen" });   // any room → ok
check("lounge → kitchen allowed", m3.ok === true && m3.room === "kitchen");

// stepping into the corridor: allowed, and investigation is then refused
const mc = await ask(A, "region:enter", { room: "kitchen", inCorridor: true });
check("stepping into the corridor is accepted", mc.ok === true && mc.inCorridor === true);
const invCorridor = await ask(A, "hotspot:examine", { hotspotId: "kitchen_pantry" });
check("cannot examine from the corridor", invCorridor.ok === false && /room/i.test(invCorridor.error));
await ask(A, "region:enter", { room: "kitchen", inCorridor: false }); // back inside → A ends in kitchen

const mB1 = await ask(B, "region:enter", { room: "dining" });        // study → dining
check("Watson study → dining allowed", mB1.ok === true);
const mB2 = await ask(B, "region:enter", { room: "conservatory" });  // far room — reachable via corridor
check("Watson dining → conservatory allowed (any room reachable)", mB2.ok === true);

// --- vague chat must not name rooms ---
log("\n[7] Chat broadcast privacy:");
let chatLeak = false;
const roomWords = ["library", "kitchen", "dining", "lounge", "study", "conservatory"];
A.on("chat", (line) => { if (roomWords.some((w) => line.text.toLowerCase().includes(w))) chatLeak = true; });
await ask(B, "region:enter", { room: "conservatory" });
await sleep(150);
check("chat text never names a room", chatLeak === false);

// --- investigation (step 7): reveal a room's clues at once, real counts ---
log("\n[8] Investigation reveals the player's clues for their room:");
// A is in the kitchen, B in the conservatory (from the moves above).
const invA1 = await ask(A, "hotspot:examine", { hotspotId: "kitchen_pantry" });
check("A examines kitchen_pantry → ok + clue found", invA1.ok === true && invA1.found === true);
check("examined clue carries prose text", typeof invA1.clue?.text === "string" && invA1.clue.text.length > 0);
check("examined clue does NOT leak the 'eliminates' solver key", !("eliminates" in invA1.clue));

const invA2 = await ask(A, "hotspot:examine", { hotspotId: "kitchen_pantry" });
check("A re-examines same hotspot → 'already'", invA2.ok === false && invA2.already === true);

const invAempty = await ask(A, "hotspot:examine", { hotspotId: "kitchen_sink" });
check("A examines an empty hotspot → ok, no clue", invAempty.ok === true && invAempty.found === false);

const invB1 = await ask(B, "hotspot:examine", { hotspotId: "conservatory_fountain" });
check("B examines conservatory_fountain → ok + clue found", invB1.ok === true && invB1.found === true);

const stA = await ask(A, "state:request", {});
const stB = await ask(B, "state:request", {});
check("A's own clueCount is now 1", stA.view.you.clueCount === 1);
check("A sees opponent (Watson) count 1", stA.view.opponent.clueCount === 1);
check("B's own clueCount is now 1", stB.view.you.clueCount === 1);
check("A's examined-hotspot list includes kitchen_pantry", stA.view.you.examinedHotspots.includes("kitchen_pantry"));
log(`      tracker — ${stA.view.you.name}: ${stA.view.you.clueCount}/${stA.view.progressTotal} | ${stA.view.opponent.name}: ${stA.view.opponent.clueCount}/${stA.view.progressTotal}`);

// notebook source data (step 9): view carries full found clues for the player
const fcA = stA.view.you.foundClues;
check("foundClues present in A's view", Array.isArray(fcA) && fcA.length === 1);
check("found clue carries prose + tag + found_in + hotspot", typeof fcA[0].text === "string" && typeof fcA[0].tag === "string" && fcA[0].found_in === "kitchen" && fcA[0].hotspot === "kitchen_pantry");
check("found clue does NOT leak 'eliminates'", !("eliminates" in fcA[0]));

// --- red herrings are revealed but DON'T count toward the 7 ---
log("\n[8b] Red herrings show up but never inflate the progress count:");
const mA5 = await ask(A, "region:enter", { room: "library" });   // kitchen ↔ library
check("A moves kitchen → library", mA5.ok === true);
const invA3a = await ask(A, "hotspot:examine", { hotspotId: "library_writing_desk" }); // shared-2 (real)
const invA3b = await ask(A, "hotspot:examine", { hotspotId: "library_bookshelves" });  // rh-p1 (herring)
check("A examines library desk + bookshelves → both found", invA3a.found === true && invA3b.found === true);
const stA2 = await ask(A, "state:request", {});
check("A now holds 3 found clue ids", stA2.view.you.clues.length === 3);
check("but clueCount stays 2 (herring excluded)", stA2.view.you.clueCount === 2);
// the herring must be INDISTINGUISHABLE in the notebook feed — no flag at all
check("foundClues lists all 3 (incl. herring)", stA2.view.you.foundClues.length === 3);
check("no found clue is flagged as a red herring", stA2.view.you.foundClues.every((c) => !("red_herring" in c)));
log(`      tracker — ${stA2.view.you.name}: ${stA2.view.you.clueCount}/${stA2.view.progressTotal} (found ${stA2.view.you.clues.length} incl. 1 herring)`);

// --- suspect questioning (step 8): budgets, confront, privacy ---
log("\n[9] Suspect questioning — budgets, dialogue branches, evidence confront:");
// Watch the opponent's (B) ambient chat for any leak of suspect/question/answer.
let qLeak = false;
const suspectNames = stA2.view.caseInfo.suspects.map((s) => s.name.toLowerCase());
B.on("chat", (line) => {
  const t = line.text.toLowerCase();
  if (t.includes("?") || t.includes("vale") || suspectNames.some((n) => t.includes(n))) qLeak = true;
});

const qa1 = await ask(A, "suspect:ask", { suspectId: "s1", questionId: QUESTION_IDS[0] });
check("A asks s1 a question → ok + answer", qa1.ok === true && typeof qa1.answer === "string" && qa1.answer.length > 0);
check("budget reads 1/3", qa1.asked === 1 && qa1.cap === 3);
await ask(A, "suspect:ask", { suspectId: "s1", questionId: QUESTION_IDS[1] });
await ask(A, "suspect:ask", { suspectId: "s1", questionId: QUESTION_IDS[2] });
const qa4 = await ask(A, "suspect:ask", { suspectId: "s1", questionId: QUESTION_IDS[3] });
check("4th question on s1 REJECTED (3-cap)", qa4.ok === false && qa4.capped === true);

const qaB = await ask(B, "suspect:ask", { suspectId: "s1", questionId: QUESTION_IDS[0] });
check("budgets are per-player (B can still ask s1)", qaB.ok === true && qaB.asked === 1);

// A holds shared-2 (found in the library) — the culprit's tell is keyed to it.
const conf = await ask(A, "suspect:confront", { suspectId: "s3", clueId: "shared-2" });
check("A confronts culprit s3 with found evidence → ok", conf.ok === true);
check("culprit reveals a behavioral tell", conf.hadTell === true && typeof conf.response.tell === "string" && conf.response.tell.length > 0);
log(`      tell — "${conf.response.tell}"`);
const confDup = await ask(A, "suspect:confront", { suspectId: "s3", clueId: "shared-2" });
check("re-confronting the same evidence REJECTED", confDup.ok === false);
const confUnfound = await ask(A, "suspect:confront", { suspectId: "s3", clueId: "shared-1" });
check("confront with UNfound evidence REJECTED", confUnfound.ok === false);

// privacy: no dialogue tree / Q&A leaks through the view payload
const stA3 = await ask(A, "state:request", {});
const qblob = JSON.stringify(stA3.view).toLowerCase();
check("no 'dialogue_tree' in view", !qblob.includes("dialogue_tree"));
check("no 'evidence_responses' in view", !qblob.includes("evidence_responses"));
check("no answer prose in view (e.g. 'mourning a marriage')", !qblob.includes("mourning a marriage"));
check("own questioning state present (s1 asked 3)", stA3.view.you.questioning?.s1?.asked === 3);
check("own confronted list records shared-2 on s3", stA3.view.you.questioning?.s3?.confronted.includes("shared-2"));

await sleep(150);
check("opponent ambient chat leaked no suspect/question/answer", qLeak === false);

// Helper: a fresh, started room with two new clients (server runs fast timers).
async function freshRoom(nameH, nameW) {
  const h = io(URL, { forceNew: true });
  const w = io(URL, { forceNew: true });
  await Promise.all([wait(h, "connect"), wait(w, "connect")]);
  const hs = wait(h, "game:start");
  const created = await ask(h, "room:create", { name: nameH, devMode: true });
  const ws = wait(w, "game:start");
  await ask(w, "room:join", { code: created.code, name: nameW });
  await Promise.all([hs, ws]);
  return { h, w };
}

// --- accusation endgame (step 10): privacy, reveal, scoring ---
log("\n[10] Accusation — lock-in, privacy boundary, reveal & scoring:");
{
  const { h, w } = await freshRoom("Sherlock", "John");
  // Gather evidence: Holmes searches the study (2 clues); Watson study then dining.
  const he1 = await ask(h, "hotspot:examine", { hotspotId: "study_desk" });     // shared-3
  const he2 = await ask(h, "hotspot:examine", { hotspotId: "study_armchair" });  // p1-4
  check("Holmes finds 2 clues in the study", he1.found === true && he2.found === true);
  await ask(w, "hotspot:examine", { hotspotId: "study_desk" });      // shared-3
  await ask(w, "region:enter", { room: "dining" });
  await ask(w, "hotspot:examine", { hotspotId: "dining_table" });     // shared-1
  await ask(w, "hotspot:examine", { hotspotId: "dining_sideboard" }); // p2-1

  // privacy BEFORE any lock-in
  const preH = await ask(h, "state:request", {});
  check("no 'solution' in Holmes's view pre-reveal", !JSON.stringify(preH.view).includes("solution"));
  check("view exposes lock FLAGS, not choices", preH.view.accusation.youLocked === false && !("culpritId" in preH.view.accusation));

  const badLock = await ask(h, "accuse:lock", { culpritId: "s3", weaponId: "w5", roomId: "library", clueIds: ["shared-3"] });
  check("lock with only 1 clue rejected", badLock.ok === false);

  const revealH = wait(h, "game:reveal");
  const revealW = wait(w, "game:reveal");

  const lockH = await ask(h, "accuse:lock", { culpritId: "s3", weaponId: "w5", roomId: "library", clueIds: ["shared-3", "p1-4"] });
  check("Holmes locks in (correct) → ok", lockH.ok === true);

  const midW = await ask(w, "state:request", {});
  check("Watson sees opponent locked + a final deadline (flag only)", midW.view.accusation.opponentLocked === true && !!midW.view.accusation.finalDeadline);
  check("opponent's choices still not in Watson's view", !JSON.stringify(midW.view).includes("\"culpritId\""));

  const lockW = await ask(w, "accuse:lock", { culpritId: "s1", weaponId: "w5", roomId: "library", clueIds: ["shared-1", "p2-1"] });
  check("Watson locks in (partial) → ok", lockW.ok === true);

  const [rH] = await Promise.all([revealH, revealW]);
  const Hs = rH.players.find((p) => p.character === "holmes");
  const Ws = rH.players.find((p) => p.character === "watson");
  log(`      REVEAL — truth: ${rH.solution.culpritName} / ${rH.solution.weaponName} / ${rH.solution.roomLabel}`);
  log(`      Holmes ${Hs.score.base}+${Hs.score.reasoning}+${Hs.score.speed}=${Hs.score.total}  vs  Watson ${Ws.score.base}+${Ws.score.reasoning}+${Ws.score.speed}=${Ws.score.total}`);
  check("reveal now contains BOTH accusations", !!Hs.accusation && !!Ws.accusation);
  check("scores: Holmes 7, Watson 4", Hs.score.total === 7 && Ws.score.total === 4);
  check("winner is Holmes alone", rH.winners.length === 1 && rH.winners[0] === "holmes");
  check("monologue references the true culprit", rH.monologue.includes("Sebastian Vale"));
  h.close(); w.close();
}

// --- timer transitions (step 10): window auto-forfeit + soft force-resolve ---
log("\n[11] Timer transitions:");
{
  const { h, w } = await freshRoom("Speedy", "Slow");
  await ask(h, "hotspot:examine", { hotspotId: "study_desk" });    // shared-3
  await ask(h, "hotspot:examine", { hotspotId: "study_armchair" }); // p1-4 — 2 clues so Holmes can lock
  const revH = wait(h, "game:reveal");
  const revW = wait(w, "game:reveal");
  await ask(h, "accuse:lock", { culpritId: "s3", weaponId: "w5", roomId: "library", clueIds: ["shared-3", "p1-4"] });
  log("      Holmes locked; waiting out Watson's 2s window…");
  const [r] = await Promise.all([revH, revW]); // resolves when the window closes
  const Ws = r.players.find((p) => p.character === "watson");
  check("[window] silent opponent auto-forfeits when the window closes", Ws.forfeited === true);
  check("[window] the submitter wins", r.winners.length === 1 && r.winners[0] === "holmes");
  h.close(); w.close();
}
{
  const { h, w } = await freshRoom("Idle1", "Idle2");
  const revH = wait(h, "game:reveal");
  const revW = wait(w, "game:reveal");
  log("      neither player accuses; waiting out the 8s soft cap…");
  const [r] = await Promise.all([revH, revW]); // soft timer force-resolves
  check("[soft] game force-resolves with no lock-ins", r.players.every((p) => p.forfeited));
  check("[soft] both forfeit → tie (both 'win' at 0)", r.winners.length === 2);
  h.close(); w.close();
}

log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED ✓" : failures + " CHECK(S) FAILED ✗"} ===`);
A.close(); B.close();
process.exit(failures === 0 ? 0 : 1);
