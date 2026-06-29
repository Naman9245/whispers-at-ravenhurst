// Phase 2.4a bugfix regression e2e. Covers:
//   • Wall-block: holding a key into a wall → character goes IDLE (no "moonwalk"
//     animation) AND footsteps fall silent; moving again resumes both.
//   • Examine proximity is tight (~26px): E does nothing from across the room,
//     works only when almost touching the furniture.
//   • Auto-face: pressing E turns the character toward the hotspot first.
// Headless Chrome has no speakers, so audio is asserted via window.__wrAudio.state();
// movement / facing / animation-state via window.__wrChar. Needs client + server.
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173", VW = 1600, VH = 900;
let fails = 0;
const ok = (l, c) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${l}`); if (!c) fails++; };
const clickByText = async (p, t) => { for (const h of await p.$$("button")) if ((await h.evaluate(b => b.textContent.trim())) === t) { await h.click(); return true; } return false; };
const pos = (p) => p.evaluate(() => ({ x: window.__wrChar.x, y: window.__wrChar.y, room: window.__wrChar.anchorRoom, dir: window.__wrChar.dir, state: window.__wrChar.state }));
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
  ok("blocked by wall → character animation is IDLE (no moonwalk)", a2.state === "idle");
  let s = await aud(h);
  ok("blocked by wall → footsteps SILENT (walk loop not playing)", s.footState === "idle" && s.playing.footstepsWalk === false);
  await up(h, ["w"]);

  console.log("\n[2] Move AWAY from the wall → footsteps resume immediately.");
  await down(h, ["s"]); await sleep(350); // walk south, off the wall
  const mv = await pos(h);
  s = await aud(h);
  ok("moving again → animation WALKING + footsteps play", mv.state === "walking" && s.footState === "walk" && s.playing.footstepsWalk === true);
  await up(h, ["s"]);

  console.log("\n[3] SPRINT into the wall → no sprint footstep either.");
  await place(h, 236, 320);
  await down(h, ["Shift", "w"]); await sleep(900); // sprint-pin against the top wall
  const b1 = await pos(h);
  await sleep(220);
  const b2 = await pos(h);
  ok("character is sprint-pinned (position not advancing)", Math.abs(b2.y - b1.y) < 0.5 && Math.abs(b2.x - b1.x) < 0.5);
  ok("sprint-blocked → character animation is IDLE (no moonwalk)", b2.state === "idle");
  s = await aud(h);
  ok("blocked by wall while sprinting → SILENT (no sprint/walk loop)", s.footState === "idle" && s.playing.footstepsSprint === false && s.playing.footstepsWalk === false);
  await up(h, ["Shift", "w"]);

  console.log("\n[4] Walk ALONG the wall (parallel, position changes) → footsteps DO play.");
  const c0 = await pos(h);              // still pinned near the top wall
  await down(h, ["d"]); await sleep(350); // slide east along the wall
  const c1 = await pos(h);
  s = await aud(h);
  ok("sliding along the wall moves the feet (x advanced)", Math.abs(c1.x - c0.x) >= 0.5);
  ok("walking along the wall → animation WALKING + footsteps play", c1.state === "walking" && s.footState === "walk" && s.playing.footstepsWalk === true);
  await up(h, ["d"]);

  console.log("\n=== BUG 2: examination proximity is tight (~26px) ===");
  console.log("\n[5] E from across the room does NOTHING (too far from any hotspot).");
  await place(h, 160, 250, "south");   // ~76px from the nearest hotspot (the desk)
  await sleep(140);
  await pressE(h); await sleep(300);
  ok("E from afar → no examination (no modal)", !(await hasModal(h)));

  console.log("\n[6] Walk right up to the desk (~18px) → E examines it.");
  await place(h, HS.desk[0] + 18, HS.desk[1], "east");   // ~18px from the desk centre
  await sleep(140);
  await pressE(h); await sleep(320);
  ok("E up close → examination starts (modal opens)", await hasModal(h));
  if (await hasModal(h)) { await h.keyboard.press("Enter"); await sleep(180); }

  console.log("\n=== BUG (regression): E auto-faces the character toward the hotspot ===");
  // place char ~18px from a hotspot (inside the tight radius), facing AWAY; press E;
  // expect facing TOWARD it. (the desk is already examined above, so use the other 3.)
  const faceCases = [
    { name: "bookshelf from the SE",     at: [HS.bookshelf[0] + 13, HS.bookshelf[1] + 13], away: "south-east", expect: "north-west" },
    { name: "fireplace from the north",  at: [HS.fireplace[0], HS.fireplace[1] - 18],      away: "north",      expect: "south" },
    { name: "armchair from the SW",      at: [HS.armchair[0] - 13, HS.armchair[1] + 13],   away: "south-west", expect: "north-east" },
  ];
  let caseNo = 7;
  for (const fc of faceCases) {
    await place(h, fc.at[0], fc.at[1], fc.away);
    await sleep(140);
    const before = (await pos(h)).dir;
    await pressE(h);
    await sleep(320);
    const after = (await pos(h)).dir;
    const opened = await hasModal(h);
    console.log(`   [${caseNo}] ${fc.name}: was '${before}' → now '${after}' (expect '${fc.expect}')`);
    ok(`auto-face: ${fc.name} → faces ${fc.expect} (and examined within ~18px)`, before === fc.away && after === fc.expect && opened);
    if (opened) { await h.keyboard.press("Enter"); await sleep(180); }
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
