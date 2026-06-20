// Phase 2.3a: verify modal Enter/Esc close (+ input resumes) and Shift sprint (~2x).
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173", VW = 1600, VH = 900;
let fails = 0;
const ok = (l, c) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${l}`); if (!c) fails++; };
const clickByText = async (p, t) => { for (const h of await p.$$("button")) if ((await h.evaluate(b => b.textContent.trim())) === t) { await h.click(); return true; } return false; };
const pos = (p) => p.evaluate(() => ({ x: window.__wrChar.x, y: window.__wrChar.y, room: window.__wrChar.anchorRoom, cor: window.__wrChar.inCorridor }));
const hasModal = (p) => p.evaluate(() => !!document.querySelector(".examine-modal"));
async function moveTo(page, tx, ty, tol = 10, max = 220) {
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
const holdD = async (page, ms, shift = false) => {
  if (shift) await page.keyboard.down("Shift");
  await page.keyboard.down("d"); await sleep(ms); await page.keyboard.up("d");
  if (shift) await page.keyboard.up("Shift");
  await sleep(80);
};

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

  console.log("\n[1] ENTER closes the examine modal; movement resumes with no canvas click.");
  await moveTo(h, 44 + 0.5 * 384, 120 + 0.5 * 252); // study_desk
  await h.keyboard.down("e"); await sleep(130); await h.keyboard.up("e"); await sleep(250);
  ok("examine modal open", await hasModal(h));
  await h.keyboard.press("Enter"); await sleep(200);
  ok("Enter closed the modal", !(await hasModal(h)));
  const before = await pos(h);
  await holdD(h, 350); // no mouse click first — input must already work
  const after = await pos(h);
  ok("WASD works immediately after close (moved without clicking)", Math.hypot(after.x - before.x, after.y - before.y) > 8);

  console.log("\n[2] ESC closes the examine modal too.");
  await moveTo(h, 44 + 0.5 * 384, 120 + 0.74 * 252); // study_armchair
  await h.keyboard.down("e"); await sleep(130); await h.keyboard.up("e"); await sleep(250);
  ok("second examine modal open", await hasModal(h));
  await h.keyboard.press("Escape"); await sleep(200);
  ok("Escape closed the modal", !(await hasModal(h)));

  console.log("\n[3] Shift sprint ≈ 2x distance (measured in the corridor).");
  await moveTo(h, 236, 430);            // into the corridor
  await moveTo(h, 280, 430);            // clear of the left wall
  const n0 = await pos(h); await holdD(h, 500, false); const n1 = await pos(h);
  const distNormal = n1.x - n0.x;
  const s0 = await pos(h); await holdD(h, 500, true); const s1 = await pos(h);
  const distSprint = s1.x - s0.x;
  console.log(`   normal ${distNormal.toFixed(1)}px / 500ms   sprint ${distSprint.toFixed(1)}px / 500ms   ratio ${(distSprint / distNormal).toFixed(2)}x`);
  ok("both moved", distNormal > 10 && distSprint > 10);
  ok("sprint is ~2x faster (ratio ≥ 1.6)", distSprint / distNormal >= 1.6);

  console.log("\n[4] Shift alone (no direction) does not move the character.");
  const i0 = await pos(h);
  await h.keyboard.down("Shift"); await sleep(400); await h.keyboard.up("Shift"); await sleep(80);
  const i1 = await pos(h);
  ok("Shift alone keeps the character idle", Math.hypot(i1.x - i0.x, i1.y - i0.y) < 2);

  console.log("\n[errors]:", errors.length ? errors.slice(0, 5).join(" | ") : "none");
  ok("no console/page errors", errors.length === 0);
  console.log(`\n=== ${fails === 0 ? "POLISH 2.3a: ALL PASSED ✓" : fails + " FAILED ✗"} ===`);
} catch (e) {
  console.error("ERROR:", e.stack || e.message); fails++;
} finally {
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
}
