// Verifies the server REJECTS investigate/question/confront from a player who has
// already locked in -- but still lets them WALK. Needs the server running
// (WHISPERS_FAST_TIMERS=demo gives an open accuse gate). Run: node test/lockout.js
//
// Movement was deliberately un-gated in Phase 2.8: sitting frozen for the rest of
// the game was the worst part of locking in early, and roaming leaks nothing
// (room/inCorridor are private, and the chat line is vague on purpose). The three
// checks below are the real lockout now.
import { io } from "socket.io-client";
import { CORE_QUESTION_IDS as QUESTION_IDS } from "../../shared/suspectQuestions.js";
const URL = "http://localhost:3001";
const ask = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));
const wait = (s, ev) => new Promise((r) => s.once(ev, r));
let fails = 0;
const ok = (l, c) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${l}`); if (!c) fails++; };

const h = io(URL, { forceNew: true });
const w = io(URL, { forceNew: true });
await Promise.all([wait(h, "connect"), wait(w, "connect")]);
const hs = wait(h, "game:start");
const created = await ask(h, "room:create", { name: "Holmes", devMode: true });
const ws = wait(w, "game:start");
await ask(w, "room:join", { code: created.code, name: "Watson" });
await Promise.all([hs, ws]);

// Holmes gathers 2 clues in the study (two hotspots), then locks in.
const e1 = await ask(h, "hotspot:examine", { hotspotId: "study_desk" });
const e2 = await ask(h, "hotspot:examine", { hotspotId: "study_armchair" });
ok("Holmes finds 2 clues at study hotspots", e1.ok && e1.found && e2.ok && e2.found);
const clueIds = [e1.clue.id, e2.clue.id];
const lock = await ask(h, "accuse:lock", { culpritId: "s3", weaponId: "w5", roomId: "library", clueIds });
ok("Holmes locks in", lock.ok === true);

// Movement stays open -- the locked-in detective can pace the manor while waiting.
const mv = await ask(h, "region:enter", { room: "dining" });
ok("region:enter STILL ALLOWED after lock-in", mv.ok === true && mv.room === "dining");

// Every genuine ACTION must still be rejected with locked:true.
const iv = await ask(h, "hotspot:examine", { hotspotId: "study_bookshelf" });
ok("hotspot:examine rejected after lock-in", iv.ok === false && iv.locked === true);
const qa = await ask(h, "suspect:ask", { suspectId: "s1", questionId: QUESTION_IDS[0] });
ok("suspect:ask rejected after lock-in", qa.ok === false && qa.locked === true);
const cf = await ask(h, "suspect:confront", { suspectId: "s1", clueId: clueIds[0] });
ok("suspect:confront rejected after lock-in", cf.ok === false && cf.locked === true);

// Watson (not locked) can still act.
const wmv = await ask(w, "region:enter", { room: "dining" });
ok("opponent (not locked) can still move", wmv.ok === true);

console.log(`\n=== ${fails === 0 ? "LOCKOUT: ALL PASSED ✓" : fails + " FAILED ✗"} ===`);
h.close(); w.close();
process.exit(fails === 0 ? 0 : 1);
