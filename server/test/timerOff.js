// Regression test for Timer: Off (Phase 2.8). Needs a running server on :3001,
// started WITHOUT WHISPERS_FAST_TIMERS — that env var deliberately overrides host
// settings, so it would mask exactly what this file exists to check.
//
// The bug being pinned: `softTimer` is null when the host picks "Off", and
// `null * 1000` is 0. Unguarded, scheduleForceResolve() computed a delay of 0 and
// fired on the next tick, so choosing "no time limit" revealed the solution the
// instant the second player joined — the precise inverse of the setting. The
// matching client-side trap is `softMs`, which must arrive as null, not 0, or the
// ACCUSE pill freezes at 0:00 and the final-minute visuals fire immediately.
//
// It also checks the other half: Timer: Off must still be able to END. Nothing
// force-resolves it, but the first lock-in opens the rival's window as usual.
import { io } from "socket.io-client";
import { ROOM_IDS } from "../../shared/mapData.js";
import { ROOM_HOTSPOTS } from "../../shared/roomHotspots.js";

const URL = "http://localhost:3001";
const ask = (sock, ev, payload) => new Promise((res) => sock.emit(ev, payload, res));
const wait = (sock, ev) => new Promise((res) => sock.once(ev, res));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${label}`);
  if (!cond) failures++;
};

if (process.env.WHISPERS_FAST_TIMERS) {
  console.log("\n  ! WHISPERS_FAST_TIMERS is set — it overrides host settings.");
  console.log("    Restart the server without it, or this test proves nothing.\n");
  process.exit(1);
}

const A = io(URL, { forceNew: true });
const B = io(URL, { forceNew: true });
await Promise.all([wait(A, "connect"), wait(B, "connect")]);

// A short rival window so the endgame half of this test doesn't take minutes,
// and an open gate so we can accuse straight away.
const SETTINGS = { softTimer: null, accuseGate: 0, opponentWindow: 120 };

console.log("\n[1] A room created with Timer: Off starts normally.");
const startA = wait(A, "game:start");
const created = await ask(A, "room:create", { name: "Holmes", settings: SETTINGS });
const startB = wait(B, "game:start");
await ask(B, "room:join", { code: created.code, name: "Watson" });
const viewA = await startA;
await startB;

check("game is playing", viewA.status === "playing");
check("softMs is null, NOT 0", viewA.accusation.softMs === null);
check("the gate is open immediately", viewA.accusation.opensAt === viewA.accusation.startedAt);
check("settings echoed to the client", viewA.settings?.softTimer === null);

console.log("\n[2] No force-resolve fires (this is the whole point).");
// A resolve triggered by the null bug lands within a tick or two. Three seconds
// is many orders of magnitude more than that and still quick to run.
let revealed = false;
A.once("game:reveal", () => { revealed = true; });
B.once("game:reveal", () => { revealed = true; });
await sleep(3000);
check("no game:reveal after 3s", revealed === false);

const still = await ask(A, "state:request", {});
check("game is still playing", still.view.status === "playing");
check("softMs is still null", still.view.accusation.softMs === null);

console.log("\n[3] It can still END: the first lock-in opens the rival's window.");
// tryLock() requires 2–3 cited clues the player has actually FOUND, and nobody
// starts with any — both detectives have to go dig first. Rooms are walked with
// region:enter rather than hard-coding hotspot ids, so this keeps working if the
// case data ever moves a clue somewhere else.
async function gatherClues(sock, want = 2) {
  for (const room of ROOM_IDS) {
    const state = await ask(sock, "state:request", {});
    if ((state.view.you.foundClues || []).length >= want) break;
    await ask(sock, "region:enter", { room, inCorridor: false });
    for (const h of ROOM_HOTSPOTS[room] || []) {
      await ask(sock, "hotspot:examine", { hotspotId: h.id });
    }
  }
  const done = await ask(sock, "state:request", {});
  return done.view.you.foundClues || [];
}

const clues = await gatherClues(A);
check("A found clues to cite", clues.length >= 2);

const revealA = wait(A, "game:reveal");
const revealB = wait(B, "game:reveal");
const locked = await ask(A, "accuse:lock", {
  culpritId: "s1", weaponId: "w1", roomId: "study",
  clueIds: clues.slice(0, 2).map((c) => c.id),
});
check("lock-in accepted", locked.ok === true);

const after = await ask(B, "state:request", {});
check("rival sees the lock", after.view.accusation.opponentLocked === true);
check("a real deadline now exists", Number.isFinite(after.view.accusation.finalDeadline));

// B answers so the game resolves without waiting out the whole rival window.
const bClues = await gatherClues(B);
check("B found clues to cite", bClues.length >= 2);
await ask(B, "accuse:lock", {
  culpritId: "s2", weaponId: "w2", roomId: "library",
  clueIds: bClues.slice(0, 2).map((c) => c.id),
});
const [rA] = await Promise.all([revealA, revealB]);
check("both lock-ins resolve the game", Boolean(rA?.solution));

A.close(); B.close();
console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED ✓" : failures + " CHECK(S) FAILED ✗"} ===\n`);
process.exit(failures ? 1 : 0);
