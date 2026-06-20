// Verifies the server REJECTS move/investigate/question/confront from a player
// who has already locked in. Needs the server running (WHISPERS_FAST_TIMERS=demo
// gives an open accuse gate). Run: node test/lockout.js
import { io } from "socket.io-client";
import { QUESTION_IDS } from "../../shared/questions.js";
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

// Holmes gathers 2 clues in the study, then locks in.
const inv = await ask(h, "investigate", {});
ok("Holmes finds clues in the study", inv.ok && inv.revealed.length >= 2);
const clueIds = inv.revealed.slice(0, 2).map((c) => c.id);
const lock = await ask(h, "accuse:lock", { culpritId: "s3", weaponId: "w5", roomId: "library", clueIds });
ok("Holmes locks in", lock.ok === true);

// Now every action must be rejected with locked:true.
const mv = await ask(h, "region:enter", { room: "dining" });
ok("region:enter rejected after lock-in", mv.ok === false && mv.locked === true);
const iv = await ask(h, "investigate", {});
ok("investigate rejected after lock-in", iv.ok === false && iv.locked === true);
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
