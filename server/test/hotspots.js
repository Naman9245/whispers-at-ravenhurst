// Verifies the hotspot examination system end-to-end over sockets. Needs the
// server running (WHISPERS_FAST_TIMERS=demo gives an open accuse gate + long game).
// Run: node test/hotspots.js
import { io } from "socket.io-client";
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
await Promise.all([hs, ws]); // both start in the study

console.log("\n[1] Examining a hotspot in another room is rejected.");
const wrong = await ask(h, "hotspot:examine", { hotspotId: "kitchen_pantry" });
ok("examine outside current room rejected", wrong.ok === false && /room/i.test(wrong.error));

console.log("\n[2] An unknown hotspot id is rejected.");
const unknown = await ask(h, "hotspot:examine", { hotspotId: "study_nope" });
ok("unknown hotspot rejected", unknown.ok === false);

console.log("\n[3] An empty hotspot returns flavor (no clue); a real one returns a clue.");
const empty = await ask(h, "hotspot:examine", { hotspotId: "study_bookshelf" });
ok("empty hotspot → ok, found:false", empty.ok === true && empty.found === false && empty.hotspotName === "The Bookshelf");
const real = await ask(h, "hotspot:examine", { hotspotId: "study_desk" });
ok("real hotspot → ok, found:true with clue", real.ok === true && real.found === true && real.clue?.id === "shared-3");
ok("returned clue does NOT leak 'eliminates'", real.found && !("eliminates" in real.clue));
ok("returned clue carries its hotspot", real.clue?.hotspot === "study_desk");

console.log("\n[4] Re-examining the same hotspot is rejected.");
const again = await ask(h, "hotspot:examine", { hotspotId: "study_desk" });
ok("re-examine rejected ('already')", again.ok === false && again.already === true);

console.log("\n[5] Both players examine the same hotspot independently.");
const wReal = await ask(w, "hotspot:examine", { hotspotId: "study_desk" });
ok("Watson independently finds shared-3 at the same hotspot", wReal.ok === true && wReal.found === true && wReal.clue?.id === "shared-3");

console.log("\n[6] Privacy: the view exposes own examinedHotspots, never the opponent's nor unfound clues.");
const stH = await ask(h, "state:request", {});
const v = stH.view;
ok("own examinedHotspots present (desk + bookshelf)", v.you.examinedHotspots.includes("study_desk") && v.you.examinedHotspots.includes("study_bookshelf"));
ok("opponent object has NO examinedHotspots", v.opponent && !("examinedHotspots" in v.opponent));
ok("Holmes's own count is 1 (shared-3)", v.you.clueCount === 1);
const blob = JSON.stringify(v).toLowerCase();
ok("unexamined clue text not leaked (p1-4 'fine layer of dust')", !blob.includes("fine layer of dust"));
ok("no hotspot→clue map leaked (no 'eliminates')", !blob.includes("eliminates"));

console.log(`\n=== ${fails === 0 ? "HOTSPOTS: ALL PASSED ✓" : fails + " FAILED ✗"} ===`);
h.close(); w.close();
process.exit(fails === 0 ? 0 : 1);
