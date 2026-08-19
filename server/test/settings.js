// Unit tests for host-chosen room settings (Phase 2.8) — no sockets, no waiting.
//
// Two things are being pinned here. First, `sanitizeSettings` is the ONLY thing
// standing between a crafted socket message and the game rules: `room:create`
// had no server-side validation, so an attacker could have sent accuseGate: -1
// (accuse instantly) or softTimer: 1e12. Second, Dev Mode and WHISPERS_FAST_TIMERS
// must keep resolving exactly as they did before, because the whole test suite
// and twelve e2e scripts depend on that precedence.
import { GameRoom } from "../game.js";
import {
  sanitizeSettings, DEFAULT_SETTINGS, DEV_SETTINGS, TIMER_PRESETS,
} from "../../shared/constants.js";

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${label}`);
  if (!cond) failures++;
};

console.log("\n[1] sanitizeSettings accepts only whitelisted values.");
{
  const clean = sanitizeSettings({ softTimer: 1800, accuseGate: 180, sprint: false });
  check("a listed timer is taken", clean.softTimer === 1800);
  check("a listed gate is taken", clean.accuseGate === 180);
  check("a listed boolean is taken", clean.sprint === false);
  check("unspecified keys fall back", clean.opponentWindow === DEFAULT_SETTINGS.opponentWindow);

  // Each of these is a real attack, not a typo: a negative gate opens accusations
  // at t=0, and a huge cap makes the game unendable.
  const dirty = sanitizeSettings({ accuseGate: -1, softTimer: 1e12, hotspotMarkers: "yes" });
  check("negative gate rejected", dirty.accuseGate === DEFAULT_SETTINGS.accuseGate);
  check("absurd soft timer rejected", dirty.softTimer === DEFAULT_SETTINGS.softTimer);
  check("non-boolean toggle rejected", dirty.hotspotMarkers === true);

  // Values are never coerced toward what was sent — "1800" is not 1800.
  const stringy = sanitizeSettings({ softTimer: "1800" });
  check("string timer is not coerced", stringy.softTimer === DEFAULT_SETTINGS.softTimer);

  check("null/garbage input yields the fallback", sanitizeSettings(null).softTimer === DEFAULT_SETTINGS.softTimer);
  check("array input yields the fallback", sanitizeSettings([]).accuseGate === DEFAULT_SETTINGS.accuseGate);
}

console.log("\n[2] Timer: Off survives sanitising as null, not zero.");
{
  const off = sanitizeSettings({ softTimer: null });
  check("softTimer stays null", off.softTimer === null);
  // 0 would mean "the game ended the moment it started" — the exact inverse.
  check("softTimer is not 0", off.softTimer !== 0);

  const room = new GameRoom("TOFF01", false, { softTimer: null });
  check("null reaches room.timers", room.timers.softTimer === null);
  check("the other timers are untouched", room.timers.accuseGate === DEFAULT_SETTINGS.accuseGate);
}

console.log("\n[3] Dev Mode still yields the short preset (regression).");
{
  // This is the two-argument call every existing test and the lobby checkbox make.
  const room = new GameRoom("TEST01", true);
  check("softTimer 60", room.timers.softTimer === TIMER_PRESETS.dev.softTimer);
  check("accuseGate 20", room.timers.accuseGate === TIMER_PRESETS.dev.accuseGate);
  check("opponentWindow 30", room.timers.opponentWindow === TIMER_PRESETS.dev.opponentWindow);
  check("gameplay toggles default on", room.settings.sprint === true && room.settings.hotspotMarkers === true);

  const prod = new GameRoom("TEST02", false);
  check("no dev mode → production preset", prod.timers.softTimer === TIMER_PRESETS.production.softTimer);
}

console.log("\n[4] Explicit settings win over devMode, but only for listed values.");
{
  const room = new GameRoom("TEST03", true, { softTimer: 2700, rivalProgress: false });
  check("explicit soft timer applied", room.timers.softTimer === 2700);
  check("explicit toggle applied", room.settings.rivalProgress === false);
  // Unspecified keys fall back to the DEV preset, not production — the checkbox
  // still means "short timers" for anything the panel didn't send.
  check("unsent keys fall back to dev", room.timers.accuseGate === DEV_SETTINGS.accuseGate);
}

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED ✓" : failures + " CHECK(S) FAILED ✗"} ===\n`);
process.exit(failures ? 1 : 0);
