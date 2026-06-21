// Phase 2.3b: verify the 2.5s searching state before the examine modal.
// Needs client (:5173) + demo-timer server (:3001).
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173", VW = 1600, VH = 900;
let fails = 0;
const ok = (l, c) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${l}`); if (!c) fails++; };
const clickByText = async (p, t) => { for (const h of await p.$$("button")) if ((await h.evaluate(b => b.textContent.trim())) === t) { await h.click(); return true; } return false; };
const pos = (p) => p.evaluate(() => ({ x: window.__wrChar.x, y: window.__wrChar.y }));
const hasModal = (p) => p.evaluate(() => !!document.querySelector(".examine-modal"));
const SPOT = {
  study_desk:      [44 + 0.50 * 384, 120 + 0.50 * 252],
  study_armchair:  [44 + 0.50 * 384, 120 + 0.74 * 252],
  study_bookshelf: [44 + 0.20 * 384, 120 + 0.20 * 252],
};
async function moveTo(page, tx, ty, tol = 10, max = 200) {
  let stuck = 0, prev = null;
  for (let i = 0; i < max; i++) {
    const p = await pos(page); const dx = tx - p.x, dy = ty - p.y;
    if (Math.hypot(dx, dy) < tol) return true;
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1.2) { if (++stuck > 8) return false; } else stuck = 0; prev = p;
    const keys = []; if (Math.abs(dx) > tol) keys.push(dx > 0 ? "d" : "a"); if (Math.abs(dy) > tol) keys.push(dy > 0 ? "s" : "w");
    for (const k of keys) await page.keyboard.down(k); await sleep(60); for (const k of keys) await page.keyboard.up(k); await sleep(15);
  }
  return false;
}
const pressE = async (page) => { await page.keyboard.down("e"); await sleep(120); await page.keyboard.up("e"); };
async function waitModal(page, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await hasModal(page)) return Date.now() - start; await sleep(40); }
  return -1;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 150000, defaultViewport: { width: VW, height: VH }, args: [`--window-size=${VW},${VH}`] });
const errors = [];
try {
  const h = await browser.newPage();
  h.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  h.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });
  await h.goto(URL, { waitUntil: "networkidle2" });
  await h.waitForSelector(".lobby"); await clickByText(h, "Create Room");
  await h.waitForSelector(".lobby-form"); await h.click('.lb-check input[type="checkbox"]'); await clickByText(h, "Create");
  await h.waitForSelector(".lb-code-display");
  const code = await h.$eval(".lb-code-display", e => e.textContent.trim());
  const w = await browser.newPage(); await w.setViewport({ width: VW, height: VH });
  await w.goto(URL, { waitUntil: "networkidle2" });
  await w.waitForSelector(".lobby"); await clickByText(w, "Join with Code");
  await w.waitForSelector(".lb-input.code"); await w.type(".lb-input.code", code, { delay: 20 }); await clickByText(w, "Join");
  await h.waitForSelector(".board-canvas"); await sleep(2000);
  await h.bringToFront(); await h.mouse.click(VW / 2, VH / 2);

  console.log("\n[1] Press E → 2.5s searching (no instant modal); input locked; then modal.");
  await moveTo(h, ...SPOT.study_desk);
  const t0 = Date.now();
  await pressE(h);
  await sleep(300);
  ok("no modal yet ~0.3s after E (searching)", !(await hasModal(h)));
  await h.screenshot({ path: "sb-1-searching.png" });
  const p0 = await pos(h);
  await h.keyboard.down("d"); await sleep(500); await h.keyboard.up("d"); // try to move during search
  const p1 = await pos(h);
  ok("character cannot move during searching (input locked)", Math.hypot(p1.x - p0.x, p1.y - p0.y) < 2);
  const found = await waitModal(h);
  const total = Date.now() - t0; // measure from the E-press, not from waitModal's start
  console.log(`   modal opened ${total}ms after E (raw wait ${found}ms)`);
  ok("modal opens after the ~2.5s delay (2000–3800ms, not instant)", found >= 0 && total >= 2000 && total <= 3800);
  ok("modal shows the clue", await h.evaluate(() => !!document.querySelector(".examine-clue-text") || !!document.querySelector(".examine-empty")));
  await h.keyboard.press("Enter"); await sleep(200);
  ok("Enter closed the result modal", !(await hasModal(h)));

  console.log("\n[2] Pressing E again during a search is ignored (still one modal).");
  await moveTo(h, ...SPOT.study_armchair);
  await pressE(h);
  await sleep(400);
  await pressE(h); // ignored — input locked during search
  const el2 = await waitModal(h);
  ok("second hotspot search still completes once", el2 >= 1500 && (await hasModal(h)));
  const modalCount = await h.evaluate(() => document.querySelectorAll(".examine-modal").length);
  ok("exactly one modal (no stacked searches)", modalCount === 1);
  await h.keyboard.press("Escape"); await sleep(200);

  console.log("\n[3] prefers-reduced-motion → modal opens instantly (skip the 2.5s).");
  await h.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await moveTo(h, ...SPOT.study_bookshelf);
  const t3 = Date.now();
  await pressE(h);
  const found3 = await waitModal(h, 2000);
  const total3 = Date.now() - t3;
  console.log(`   reduced-motion modal ${total3}ms after E`);
  ok("reduced-motion skips the delay (modal < 1200ms total)", found3 >= 0 && total3 < 1200);
  await h.keyboard.press("Enter"); await sleep(150);
  await h.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);

  console.log("\n[4] Privacy: opponent only sees 'examining something', after the commit.");
  await w.bringToFront();
  await w.evaluate(() => [...document.querySelectorAll(".hud-tool")].find(b => /Activity/.test(b.textContent)).click());
  await sleep(300);
  const wAct = await w.evaluate(() => [...document.querySelectorAll(".activity-line")].map(l => l.textContent).join(" | "));
  console.log("   Watson activity:", JSON.stringify(wAct));
  ok("opponent sees 'examining something', never a hotspot/clue", /examining/i.test(wAct) && !/The Desk|The Armchair|The Bookshelf|lamp|dust/i.test(wAct));

  console.log("\n[errors]:", errors.length ? errors.slice(0, 5).join(" | ") : "none");
  ok("no console/page errors", errors.length === 0);
  console.log(`\n=== ${fails === 0 ? "SEARCHING 2.3b: ALL PASSED ✓" : fails + " FAILED ✗"} ===`);
} catch (e) {
  console.error("ERROR:", e.stack || e.message); fails++;
} finally {
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
}
