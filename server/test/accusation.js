// Unit tests for the accusation engine (server/game.js) — no sockets, no waiting.
// We drive the clock by setting room.startedAt directly, so gate / scoring /
// forfeit logic is checked deterministically.
import { GameRoom } from "../game.js";

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${label}`);
  if (!cond) failures++;
};

// A fresh, started room with two players and a preloaded set of found clues.
async function startedRoom() {
  const room = new GameRoom("TEST01", true);
  const A = room.addPlayer({ id: "A", name: "Holmes" });
  const B = room.addPlayer({ id: "B", name: "Watson" });
  await room.start();
  A.clues.push("p1-3", "shared-2", "rh-p1"); // real, real, herring
  B.clues.push("p2-3", "p2-4");              // real, real
  return { room, A, B };
}

console.log("\n[1] ACCUSE is gated until the accuseGate mark.");
{
  const { room } = await startedRoom();
  const early = room.tryLock("A", { culpritId: "s3", weaponId: "w5", roomId: "library", clueIds: ["p1-3", "shared-2"] });
  check("locking before the gate is rejected", early.ok === false && early.gated === true);
  room.startedAt = Date.now() - 10 * 60_000; // pretend the gate has passed
  const ok = room.tryLock("A", { culpritId: "s3", weaponId: "w5", roomId: "library", clueIds: ["p1-3", "shared-2"] });
  check("locking after the gate succeeds", ok.ok === true);
}

console.log("\n[2] Accusation format is validated server-side.");
{
  const { room } = await startedRoom();
  room.startedAt = Date.now() - 10 * 60_000;
  const base = { culpritId: "s3", weaponId: "w5", roomId: "library" };
  check("unknown suspect rejected", room.tryLock("A", { ...base, culpritId: "sX", clueIds: ["p1-3", "shared-2"] }).ok === false);
  check("too few clues rejected", room.tryLock("A", { ...base, clueIds: ["p1-3"] }).ok === false);
  check("too many clues rejected", room.tryLock("A", { ...base, clueIds: ["p1-3", "shared-2", "rh-p1", "p2-4"] }).ok === false);
  check("duplicate clue rejected", room.tryLock("A", { ...base, clueIds: ["p1-3", "p1-3"] }).ok === false);
  check("citing an unfound clue rejected", room.tryLock("A", { ...base, clueIds: ["p1-3", "p2-4"] }).ok === false);
  check("a valid accusation is accepted", room.tryLock("A", { ...base, clueIds: ["p1-3", "shared-2"] }).ok === true);
}

console.log("\n[3] Citing a red herring earns no reasoning credit.");
{
  const { room, A } = await startedRoom();
  room.startedAt = Date.now() - 10 * 60_000;
  room.tryLock("A", { culpritId: "s3", weaponId: "w5", roomId: "library", clueIds: ["shared-2", "rh-p1"] });
  const s = room.scoreFor(A);
  check("two clues cited, but only the real one scores (reasoning = 1)", s.reasoning === 1);
}

console.log("\n[4] Full scoring sample — two accusations, different scores.");
{
  const { room, A, B } = await startedRoom();
  room.startedAt = Date.now() - 10 * 60_000;
  // A: fully correct, cites two real clues, locks in FIRST.
  const ra = room.tryLock("A", { culpritId: "s3", weaponId: "w5", roomId: "library", clueIds: ["p1-3", "shared-2"] });
  // B: wrong culprit (s1), right weapon+room, two real clues, locks in second.
  const rb = room.tryLock("B", { culpritId: "s1", weaponId: "w5", roomId: "library", clueIds: ["p2-3", "p2-4"] });
  check("both locks accepted", ra.ok && rb.ok);

  const reveal = room.resolve();
  const A_ = reveal.players.find((p) => p.character === "holmes");
  const B_ = reveal.players.find((p) => p.character === "watson");

  console.log(`      Holmes: base ${A_.score.base} + reasoning ${A_.score.reasoning} + speed ${A_.score.speed} = ${A_.score.total}`);
  console.log(`      Watson: base ${B_.score.base} + reasoning ${B_.score.reasoning} + speed ${B_.score.speed} = ${B_.score.total}`);

  check("Holmes base 3 (all correct)", A_.score.base === 3);
  check("Holmes reasoning 2 (two real clues)", A_.score.reasoning === 2);
  check("Holmes speed 2 (fastest correct)", A_.score.speed === 2);
  check("Holmes total 7", A_.score.total === 7);
  check("Watson base 2 (weapon+room only)", B_.score.base === 2);
  check("Watson reasoning 2", B_.score.reasoning === 2);
  check("Watson speed 0 (not fully correct)", B_.score.speed === 0);
  check("Watson total 4", B_.score.total === 4);
  check("winner is Holmes alone", reveal.winners.length === 1 && reveal.winners[0] === "holmes");

  check("reveal exposes the solution", reveal.solution.culpritName === "Mr. Sebastian Vale" && reveal.solution.roomLabel === "LIBRARY");
  check("monologue names the culprit, weapon and room",
    reveal.monologue.includes("Sebastian Vale") && reveal.monologue.includes("Silk Cravat") && reveal.monologue.includes("LIBRARY"));
}

console.log("\n[5] A non-submitter forfeits (score 0); the other wins.");
{
  const { room } = await startedRoom();
  room.startedAt = Date.now() - 10 * 60_000;
  room.tryLock("A", { culpritId: "s3", weaponId: "w5", roomId: "library", clueIds: ["p1-3", "shared-2"] });
  const reveal = room.resolve(); // B never locked
  const B_ = reveal.players.find((p) => p.character === "watson");
  check("forfeiter is flagged", B_.forfeited === true);
  check("forfeiter scores 0", B_.score.total === 0);
  check("winner is the submitter", reveal.winners.length === 1 && reveal.winners[0] === "holmes");
}

console.log("\n[6] resolve() is idempotent (no double reveal).");
{
  const { room } = await startedRoom();
  room.startedAt = Date.now() - 10 * 60_000;
  room.tryLock("A", { culpritId: "s3", weaponId: "w5", roomId: "library", clueIds: ["p1-3", "shared-2"] });
  const first = room.resolve();
  const second = room.resolve();
  check("first resolve returns a reveal", !!first);
  check("second resolve returns null", second === null);
}

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED ✓" : failures + " CHECK(S) FAILED ✗"} ===`);
process.exit(failures === 0 ? 0 : 1);
