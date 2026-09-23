// Attacks a raw-socket client can make, and what the server must do about them.
// Needs a server running WITHOUT WHISPERS_FAST_TIMERS: the pacing checks below
// are about real search and travel time, which fast timers switch off.
//
//  [1] malformed intents are answered, never fatal (they used to crash the process)
//  [2] you cannot join your own room (it used to orphan the room)
//  [3] a host who disconnects in the lobby frees the room (no game against a ghost)
//  [4] nothing can be done until both detectives are past the briefing
//  [5] a search takes SEARCH_MS on the server, one at a time (a script used to
//      sweep all 24 hotspots in ~30ms)
//  [6] teleporting between rooms costs the walk; walking honestly costs nothing
//  [7] if your rival walks out after you locked in, the case resolves at once
import { io } from "socket.io-client";
import { SEARCH_MS, MOVE_SPEED } from "../../shared/constants.js";
import { doorwayGap } from "../../shared/mapData.js";

const URL = "http://localhost:3001";
const ask = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));
const wait = (s, ev) => new Promise((r) => s.once(ev, r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timed = async (fn) => { const t = Date.now(); const out = await fn(); return [out, Date.now() - t]; };

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${label}`);
  if (!cond) failures++;
};

if (process.env.WHISPERS_FAST_TIMERS) {
  console.log("\n  ! Run the server WITHOUT WHISPERS_FAST_TIMERS for this one.\n");
}

const connect = async () => { const s = io(URL, { forceNew: true }); await wait(s, "connect"); return s; };
const alive = async () => { try { return (await fetch(`${URL}/health`)).ok; } catch { return false; } };

// Two players in a started game. `ready` acks the briefing for both.
async function game({ settings = { accuseGate: 0 }, ready = true } = {}) {
  const A = await connect(), B = await connect();
  const startA = wait(A, "game:start"), startB = wait(B, "game:start");
  const { code } = await ask(A, "room:create", { name: "Holmes", settings });
  await ask(B, "room:join", { code, name: "Watson" });
  await Promise.all([startA, startB]);
  if (ready) await Promise.all([ask(A, "case:ready", {}), ask(B, "case:ready", {})]);
  return { A, B, code };
}

console.log("\n[1] Malformed intents are answered, never fatal.");
{
  const s = await connect();
  const events = ["room:create", "room:join", "room:leave", "state:request", "region:enter",
    "hotspot:examine", "suspect:ask", "suspect:confront", "accuse:lock", "case:ready"];
  for (const ev of events) {
    s.emit(ev, null);                 // null payload: destructuring used to throw
    s.emit(ev, "nonsense", 5);        // string payload + a non-function "ack"
    s.emit(ev, [1, 2, 3]);
  }
  s.emit("room:create", { name: 42 });                  // `.trim` on a number
  s.emit("room:create", { name: { toString: 1 } });
  const named = await ask(s, "room:create", { name: "  \u0007Mo\u0000riarty and a very long tail  " });
  await sleep(300);
  check("the server survived every one of them", await alive());
  check("a normal request still works afterwards", named?.ok === true);
  check("names are cleaned and capped", named?.view?.you?.name === "Moriarty and a v");
  s.close();
}

console.log("\n[2] You cannot join your own room.");
{
  const A = await connect();
  const { code } = await ask(A, "room:create", { name: "Holmes" });
  const self = await ask(A, "room:join", { code, name: "Holmes" });
  check("joining your own code is refused", self.ok === false && /own room/i.test(self.error));
  const B = await connect();
  const friend = await ask(B, "room:join", { code, name: "Watson" });
  check("and the room is still there for your partner", friend.ok === true);
  A.close(); B.close();
}

console.log("\n[3] A host who disconnects in the lobby frees the room.");
{
  const H = await connect();
  const { code } = await ask(H, "room:create", { name: "Holmes" });
  H.close();
  await sleep(300);
  const J = await connect();
  let started = false;
  J.once("game:start", () => { started = true; });
  const join = await ask(J, "room:join", { code, name: "Watson" });
  await sleep(200);
  check("joining a room whose host has gone fails cleanly", join.ok === false && /not found/i.test(join.error));
  check("no game starts against nobody", started === false);
  J.close();
}

console.log("\n[4] Nothing can be done until both detectives are past the briefing.");
{
  const { A, B } = await game({ ready: false });
  const acts = async (who) => ({
    region: await ask(who, "region:enter", { room: "study", inCorridor: false }),
    examine: await ask(who, "hotspot:examine", { hotspotId: "study_desk" }),
    ask: await ask(who, "suspect:ask", { suspectId: "s1", questionId: "storm" }),
    lock: await ask(who, "accuse:lock", { culpritId: "s3", weaponId: "w5", roomId: "library", clueIds: ["a", "b"] }),
  });
  const before = await acts(A);
  check("before either ack, every action is refused", Object.values(before).every((r) => r.ok === false && r.briefing === true));
  const r1 = await ask(A, "case:ready", {});
  check("the first ack does not start play", r1.began === false);
  const early = await acts(A);
  check("so the faster reader still cannot act (no head start)", Object.values(early).every((r) => r.ok === false && r.briefing === true));
  const view = (await ask(B, "state:request", {})).view;
  check("the rival can see who is waiting on them", view.opponent.ready === true && view.playStarted === false);
  check("and when the briefing runs out", Number.isFinite(view.briefingEndsAt) && view.briefingEndsAt > Date.now());
  const r2 = await ask(B, "case:ready", {});
  check("the second ack starts play", r2.began === true);
  const go = await ask(A, "region:enter", { room: "study", inCorridor: false });
  check("and now actions are accepted", go.ok === true);
  A.close(); B.close();
}

console.log("\n[5] A search takes SEARCH_MS on the server, one at a time.");
{
  const { A, B } = await game();
  const t0 = Date.now();
  const first = ask(A, "hotspot:examine", { hotspotId: "study_desk" });
  await sleep(50);
  const [second, secondMs] = await timed(() => ask(A, "hotspot:examine", { hotspotId: "study_armchair" }));
  check("a second search while one is running is refused, at once", second.ok === false && second.busy === true && secondMs < 1000);
  const res = await first;
  const took = Date.now() - t0;
  console.log(`      the search took ${took}ms (SEARCH_MS = ${SEARCH_MS})`);
  check("the result is held until the search time has passed", res.ok === true && took >= SEARCH_MS - 100);
  A.close(); B.close();
}

console.log("\n[6] Teleporting costs the walk; walking honestly costs nothing extra.");
{
  const sprintMs = (a, b) => (doorwayGap(a, b) / (MOVE_SPEED * 2)) * 1000;   // sprint is on by default
  const { A, B } = await game();

  // Teleport: straight from the study into the conservatory, never via the corridor.
  await ask(A, "region:enter", { room: "conservatory", inCorridor: false });
  const [tele, teleMs] = await timed(() => ask(A, "hotspot:examine", { hotspotId: "conservatory_bench" }));
  const walk = sprintMs("study", "conservatory");
  console.log(`      teleported search took ${teleMs}ms (search ${SEARCH_MS} + sprint across the manor ~${Math.round(walk)})`);
  check("a teleported search waits out the walk too", tele.ok === true && teleMs >= SEARCH_MS + walk * 0.7);

  // Honest: step into the corridor, take (at least) the sprint time, then enter.
  await ask(B, "region:enter", { room: "study", inCorridor: true });
  await sleep(sprintMs("study", "lounge") + 150);
  await ask(B, "region:enter", { room: "lounge", inCorridor: false });
  const [honest, honestMs] = await timed(() => ask(B, "hotspot:examine", { hotspotId: "lounge_sofa" }));
  console.log(`      honest search took ${honestMs}ms`);
  check("an honest walker only ever waits the search itself", honest.ok === true && honestMs < SEARCH_MS + 600);
  A.close(); B.close();
}

console.log("\n[7] If your rival walks out after you locked in, the case resolves at once.");
{
  const { A, B } = await game();
  await ask(A, "region:enter", { room: "study", inCorridor: false });
  const c1 = await ask(A, "hotspot:examine", { hotspotId: "study_desk" });
  const c2 = await ask(A, "hotspot:examine", { hotspotId: "study_armchair" });
  const lock = await ask(A, "accuse:lock", { culpritId: "s3", weaponId: "w5", roomId: "library", clueIds: [c1.clue.id, c2.clue.id] });
  check("Holmes locks in (the rival window is now open)", lock.ok === true);
  const reveal = Promise.race([wait(A, "game:reveal"), sleep(3000).then(() => null)]);
  await ask(B, "room:leave", {});
  const r = await reveal;
  check("Watson leaving resolves it now, not after the whole window", Boolean(r?.solution));
  check("and Holmes wins it", r?.winners?.includes("holmes"));
  A.close(); B.close();
}

console.log(`\n=== ${failures === 0 ? "ANTI-CHEAT: ALL PASSED ✓" : failures + " FAILED ✗"} ===\n`);
process.exit(failures ? 1 : 0);
