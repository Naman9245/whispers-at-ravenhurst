// Regression test: the case briefing must not eat the game clock.
//
// The bug, reported from a real playthrough: the story was still typing itself out
// when the screen was replaced by "No one cracked the case." The briefing is
// client-side ceremony, but `startedAt` was set the moment the second player
// joined, so the soft cap was already counting down behind it. In Dev Mode the cap
// is 60s and the briefing's own auto-dismiss was 60s, so the game reliably resolved
// itself while the player was still reading the first paragraph.
//
// Play now begins when BOTH detectives have put the briefing down (`case:ready`),
// and the soft cap is re-armed against that new origin.
//
// Needs a server running with WHISPERS_FAST_TIMERS=1 (8s soft cap).
import { io } from "socket.io-client";

const URL = "http://localhost:3001";
const ask = (sock, ev, payload) => new Promise((res) => sock.emit(ev, payload, res));
const wait = (sock, ev) => new Promise((res) => sock.once(ev, res));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${label}`);
  if (!cond) failures++;
};

if (process.env.WHISPERS_FAST_TIMERS !== "1") {
  console.log("\n  ! Run the server with WHISPERS_FAST_TIMERS=1 for this one.\n");
}

const A = io(URL, { forceNew: true });
const B = io(URL, { forceNew: true });
await Promise.all([wait(A, "connect"), wait(B, "connect")]);

console.log("\n[1] Joining starts the game but not yet the clock.");
const startA = wait(A, "game:start");
const created = await ask(A, "room:create", { name: "Holmes", devMode: true });
const startB = wait(B, "game:start");
await ask(B, "room:join", { code: created.code, name: "Watson" });
const [viewA] = await Promise.all([startA, startB]);
check("the game is playing", viewA.status === "playing");
const t0 = viewA.accusation.startedAt;
check("a provisional origin exists", Number.isFinite(t0));

console.log("\n[2] Reading the briefing does not burn the clock.");
// Longer than half the 8s cap. Under the bug the reveal was already in flight by
// now; the players have not acked, so play has not begun.
let revealedEarly = false;
A.once("game:reveal", () => { revealedEarly = true; });
B.once("game:reveal", () => { revealedEarly = true; });
await sleep(3000);
check("no reveal while the briefing is still up", revealedEarly === false);

console.log("\n[3] Both acks start the clock, from NOW.");
const r1 = await ask(A, "case:ready", {});
check("first ack accepted", r1.ok === true);
check("but one detective is not enough", r1.began === false);

const mid = await ask(A, "state:request", {});
check("the origin has not moved yet", mid.view.accusation.startedAt === t0);

const r2 = await ask(B, "case:ready", {});
check("second ack begins play", r2.ok === true && r2.began === true);

const after = await ask(A, "state:request", {});
const t1 = after.view.accusation.startedAt;
console.log(`      origin moved forward by ${t1 - t0}ms`);
check("the clock restarted at the briefing's end", t1 - t0 >= 2500);
check("both players see the same new origin", (await ask(B, "state:request", {})).view.accusation.startedAt === t1);

console.log("\n[4] And it still ends — the cap was re-armed, not cancelled.");
const reveal = await Promise.race([
  wait(A, "game:reveal"),
  sleep(15000).then(() => null),
]);
check("the soft cap still resolves the game", Boolean(reveal));

A.close(); B.close();
console.log(`\n=== ${failures === 0 ? "BRIEFING CLOCK: ALL PASSED ✓" : failures + " FAILED ✗"} ===\n`);
process.exit(failures ? 1 : 0);
