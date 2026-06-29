// Phase 2.4a bugfixes e2e:
//   BUG 1 — footsteps must be SILENT when movement is blocked by a wall (no
//           running-in-place), but play when the feet actually advance.
//   BUG 2 — pressing E auto-faces the character toward the hotspot before the
//           searching animation, from any approach angle.
// Headless Chrome has no speakers, so audio is asserted via window.__wrAudio.state();
// movement/facing via window.__wrChar. Needs client (:5173) + server (:3001).
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173", VW = 1600, VH = 900;
let fails = 0;
const ok = (l, c) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${l}`); if (!c) fails++; };
const clickByText = async (p, t) => { for (const h of await p.$$("button")) if ((await h.evaluate(b => b.textContent.trim())) === t) { await h.click(); return true; } return false; };
const pos = (p) => p.evaluate(() => ({ x: window.__wrChar.x, y: window.__wrChar.y, room: window.__wrChar.anchorRoom, dir: window.__wrChar.dir }));
const aud = (p) => p.evaluate(() => (window.__wrAudio ? window.__wrAudio.state() : null));
const place = (p, x, y, dir) => p.evaluate(({ x, y, dir }) => { const c = window.__wrChar; c.x = x; c.y = y; if (dir) c.dir = dir; }, { x, y, dir });
const down = async (p, keys) => { for (const k of keys) await p.keyboard.down(k); };
const up = async (p, keys) => { for (const k of keys) await p.keyboard.up(k); };
const pressE = async (p) => { await p.keyboard.down("e"); await sleep(120); await p.keyboard.up("e"); };
const hasModal = (p) => p.evaluate(() => !!document.querySelector(".examine-modal"));

// Study interior is x[60,412] y[136,356]; its only doorway is bottom-centre, so
// the TOP wall (y≈136) is solid — holding 'w' pins the feet there with no escape.
const STANDING = [236, 246];
// Study hotspot centres (roomRect study x44 y120 w384 h252).
const HS = {
  desk:      [44 + 0.50 * 384, 120 + 0.50 * 252], // 236, 246
  bookshelf: [44 + 0.20 * 384, 120 + 0.20 * 252], // 120.8, 170.4
  fireplace: [44 + 0.82 * 384, 120 + 0.80 * 252], // 358.88, 321.6
  armchair:  [44 + 0.50 * 384, 120 + 0.74 * 252], // 236, 306.48
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new", protocolTimeout: 180000,
  defaultViewport: { width: VW, height: VH },
  args: [`--window-size=${VW},${VH}`, "--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
try {
  const h = await browser.newPage();
  h.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  h.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });
  // Reduced motion → E opens the result instantly (skips the 2.5s search), keeping
  // the facing assertions fast. faceToward fires on the E-press regardless.
  await h.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await h.goto(URL, { waitUntil: "networkidle2" });
  await h.waitForSelector(".lobby"); await clickByText(h, "Create Room");
  await h.waitForSelector(".lobby-form"); await clickByText(h, "Create"); // normal timers (no dev mode)
  await h.waitForSelector(".lb-code-display");
  const code = await h.$eval(".lb-code-display", e => e.textContent.trim());
  const w = await browser.newPage(); await w.setViewport({ width: VW, height: VH });
  await w.goto(URL, { waitUntil: "networkidle2" });
  await w.waitForSelector(".lobby"); await clickByText(w, "Join with Code");
  await w.waitForSelector(".lb-input.code"); await w.type(".lb-input.code", code, { delay: 20 }); await clickByText(w, "Join");
  await h.waitForSelector(".board-canvas"); await sleep(1200);
  await h.bringToFront(); await h.mouse.click(VW / 2, VH / 2); // unlock audio
  await h.waitForFunction(() => !!window.__wrAudio && !!window.__wrChar);

  console.log("\n=== BUG 1: footsteps silent when wall-blocked ===");

  console.log("\n[1] Walk INTO the top wall → no footstep sound (running in place is silent).");
  await place(h, 236, 320);              // lower-centre: a clear run north to the top wall
  await down(h, ["w"]); await sleep(1300); // pin against the top wall
  const a1 = await pos(h);
  await sleep(280);                      // keep holding 'w'
  const a2 = await pos(h);
  ok("character is wall-pinned (position not advancing)", Math.abs(a2.y - a1.y) < 0.5 && Math.abs(a2.x - a1.x) < 0.5);
  let s = await aud(h);
  ok("blocked by wall → footsteps SILENT (idle, walk loop not playing)", s.footState === "idle" && s.playing.footstepsWalk === false);
  await up(h, ["w"]);

  console.log("\n[2] Move AWAY from the wall → footsteps resume immediately.");
  await down(h, ["s"]); await sleep(350); // walk south, off the wall
  s = await aud(h);
  ok("moving again → footsteps play", s.footState === "walk" && s.playing.footstepsWalk === true);
  await up(h, ["s"]);

  console.log("\n[3] SPRINT into the wall → no sprint footstep either.");
  await place(h, 236, 320);
  await down(h, ["Shift", "w"]); await sleep(900); // sprint-pin against the top wall
  const b1 = await pos(h);
  await sleep(220);
  const b2 = await pos(h);
  ok("character is sprint-pinned (position not advancing)", Math.abs(b2.y - b1.y) < 0.5 && Math.abs(b2.x - b1.x) < 0.5);
  s = await aud(h);
  ok("blocked by wall while sprinting → SILENT (no sprint/walk loop)", s.footState === "idle" && s.playing.footstepsSprint === false && s.playing.footstepsWalk === false);
  await up(h, ["Shift", "w"]);

  console.log("\n[4] Walk ALONG the wall (parallel, position changes) → footsteps DO play.");
  const c0 = await pos(h);              // still pinned near the top wall
  await down(h, ["d"]); await sleep(350); // slide east along the wall
  const c1 = await pos(h);
  s = await aud(h);
  ok("sliding along the wall moves the feet (x advanced)", Math.abs(c1.x - c0.x) >= 0.5);
  ok("walking along the wall → footsteps play", s.footState === "walk" && s.playing.footstepsWalk === true);
  await up(h, ["d"]);

  console.log("\n=== BUG 2: E auto-faces the character toward the hotspot ===");
  // place char OFFSET from a hotspot, facing AWAY; press E; expect facing TOWARD it.
  const faceCases = [
    { name: "desk from the east",        at: [HS.desk[0] + 40, HS.desk[1]],            away: "east",       expect: "west" },
    { name: "bookshelf from the SE",     at: [HS.bookshelf[0] + 30, HS.bookshelf[1] + 30], away: "south-east", expect: "north-west" },
    { name: "fireplace from the north",  at: [HS.fireplace[0], HS.fireplace[1] - 40],  away: "north",      expect: "south" },
    { name: "armchair from the SW",      at: [HS.armchair[0] - 28, HS.armchair[1] + 28], away: "south-west", expect: "north-east" },
  ];
  let caseNo = 5;
  for (const fc of faceCases) {
    await place(h, fc.at[0], fc.at[1], fc.away);
    await sleep(140);
    const before = (await pos(h)).dir;
    await pressE(h);
    await sleep(320);
    const after = (await pos(h)).dir;
    console.log(`   [${caseNo}] ${fc.name}: was '${before}' → now '${after}' (expect '${fc.expect}')`);
    ok(`auto-face: ${fc.name} → faces ${fc.expect}`, before === fc.away && after === fc.expect);
    if (await hasModal(h)) { await h.keyboard.press("Enter"); await sleep(180); }
    caseNo++;
  }

  console.log("\n[errors]:", errors.length ? errors.slice(0, 6).join(" | ") : "none");
  ok("no console/page errors", errors.length === 0);
  console.log(`\n=== ${fails === 0 ? "BUGFIX 2.4a: ALL PASSED ✓" : fails + " CHECK(S) FAILED ✗"} ===`);
} catch (e) {
  console.error("ERROR:", e.stack || e.message);
  console.log("recent errors:", errors.slice(-6).join(" | "));
  fails++;
} finally {
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
}
