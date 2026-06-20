// Tests the LOCK IN flow under REAL Dev Mode timers (accuseGate=20s): the ACCUSE
// button starts gated, opens at the 20s mark, then a full accusation locks in.
// Run the server WITHOUT WHISPERS_FAST_TIMERS so the dev preset (60/20/30) applies.
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173";
const VW = 1600, VH = 900;
let fails = 0;
const ok = (l, c) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${l}`); if (!c) fails++; };
const clickByText = async (page, text) => {
  for (const h of await page.$$("button")) {
    if ((await h.evaluate((b) => b.textContent.trim())) === text) { await h.click(); return true; }
  }
  return false;
};
const pos = (p) => p.evaluate(() => ({ x: window.__wrChar.x, y: window.__wrChar.y, room: window.__wrChar.anchorRoom }));
async function moveTo(page, tx, ty, tol = 12, max = 200) {
  let stuck = 0, prev = null;
  for (let i = 0; i < max; i++) {
    const p = await pos(page); const dx = tx - p.x, dy = ty - p.y;
    if (Math.hypot(dx, dy) < tol) return true;
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1.5) { if (++stuck > 8) return false; } else stuck = 0;
    prev = p;
    const keys = []; if (Math.abs(dx) > tol) keys.push(dx > 0 ? "d" : "a"); if (Math.abs(dy) > tol) keys.push(dy > 0 ? "s" : "w");
    for (const k of keys) await page.keyboard.down(k); await sleep(70); for (const k of keys) await page.keyboard.up(k); await sleep(15);
  }
  return false;
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new", protocolTimeout: 180000,
  defaultViewport: { width: VW, height: VH }, args: [`--window-size=${VW},${VH}`],
});
try {
  const holmes = await browser.newPage();
  await holmes.goto(URL, { waitUntil: "networkidle2" });
  await holmes.waitForSelector(".lobby");
  await clickByText(holmes, "Create Room");
  await holmes.waitForSelector(".lobby-form");
  await holmes.click('.lb-check input[type="checkbox"]'); // DEV MODE
  await clickByText(holmes, "Create");
  await holmes.waitForSelector(".lb-code-display");
  const code = await holmes.$eval(".lb-code-display", (el) => el.textContent.trim());

  const watson = await browser.newPage();
  await watson.setViewport({ width: VW, height: VH });
  await watson.goto(URL, { waitUntil: "networkidle2" });
  await watson.waitForSelector(".lobby");
  await clickByText(watson, "Join with Code");
  await watson.waitForSelector(".lb-input.code");
  await watson.type(".lb-input.code", code, { delay: 20 });
  await clickByText(watson, "Join");
  await holmes.waitForSelector(".board-canvas", { timeout: 15000 });
  await sleep(1500);
  await holmes.bringToFront();
  await holmes.mouse.click(VW / 2, VH / 2);

  const devBadge = await holmes.evaluate(() => !!document.querySelector(".dev-badge"));
  ok("DEV MODE badge present", devBadge);

  // Gather clues: investigate study (2 clues), then library (real + herring).
  await holmes.evaluate(() => document.querySelectorAll(".action-bar button")[1].click());
  await sleep(700);
  await moveTo(holmes, 236, 430); await moveTo(holmes, 236, 614); // study → corridor → library
  await holmes.evaluate(() => document.querySelectorAll(".action-bar button")[1].click());
  await sleep(700);

  // ACCUSE should be GATED right now (within the 20s gate window).
  const accLabelEarly = await holmes.evaluate(() => [...document.querySelectorAll(".action-bar button")].find(b => /ACCUSE|OPENS|LOCKED/.test(b.textContent))?.textContent.trim());
  const gatedNow = await holmes.evaluate(() => {
    const b = [...document.querySelectorAll(".action-bar button")].find(b => /ACCUSE|OPENS|LOCKED/.test(b.textContent));
    return b ? b.disabled : null;
  });
  console.log("   early accuse button:", accLabelEarly, "disabled:", gatedNow);
  ok("ACCUSE is gated before the 20s mark (label shows OPENS, disabled)", /OPENS/.test(accLabelEarly || "") && gatedNow === true);

  // Wait out the gate (poll up to 30s for it to enable).
  console.log("   waiting for the accuse gate to open…");
  let opened = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1500);
    const b = await holmes.evaluate(() => {
      const btn = [...document.querySelectorAll(".action-bar button")].find(b => /ACCUSE|OPENS|LOCKED/.test(b.textContent));
      return btn ? { text: btn.textContent.trim(), disabled: btn.disabled } : null;
    });
    if (b && /^ACCUSE/.test(b.text) && !b.disabled) { opened = true; console.log("   gate opened →", b.text); break; }
  }
  ok("ACCUSE enables after the gate opens", opened);

  // Open the modal and lock in.
  await holmes.evaluate(() => [...document.querySelectorAll(".action-bar button")].find(b => /^ACCUSE/.test(b.textContent)).click());
  const modal = await holmes.waitForSelector(".accuse-modal", { timeout: 5000 }).then(() => true).catch(() => false);
  ok("modal opens after gate", modal);

  // Try locking with NOTHING selected → expect inline validation message.
  await holmes.evaluate(() => document.querySelector(".lock-in-btn").click());
  await sleep(200);
  const errEmpty = await holmes.evaluate(() => document.querySelector(".accuse-error")?.textContent || "");
  console.log("   validation (empty):", JSON.stringify(errEmpty));
  ok("client validation explains what's missing", /culprit/i.test(errEmpty));

  // Fill it fully.
  await holmes.evaluate(() => document.querySelector(".accuse-grid.suspects .pick-card").click());
  await holmes.evaluate(() => document.querySelectorAll(".accuse-section .accuse-grid:not(.suspects)")[0].querySelector(".pick-chip").click());
  await holmes.evaluate(() => document.querySelectorAll(".accuse-section .accuse-grid:not(.suspects)")[1].querySelector(".pick-chip").click());
  await holmes.evaluate(() => { const c = document.querySelectorAll(".accuse-clues .accuse-clue"); c[0].click(); c[1].click(); });
  await sleep(200);
  await holmes.evaluate(() => document.querySelector(".lock-in-btn").click());

  const closed = await holmes.waitForFunction(() => !document.querySelector(".accuse-modal"), { timeout: 8000 }).then(() => true).catch(() => false);
  ok("LOCK IN submits and closes the modal", closed);
  await sleep(400);
  const toast = await holmes.evaluate(() => document.querySelector(".toast")?.textContent?.trim() || "");
  const locked = await holmes.evaluate(() => [...document.querySelectorAll(".action-bar button")].some(b => b.textContent.trim() === "LOCKED IN"));
  console.log("   toast:", JSON.stringify(toast), "| LOCKED IN btn:", locked);
  ok("confirmation shown (waiting for opponent / LOCKED IN)", /waiting|locked/i.test(toast) || locked);

  console.log(`\n=== ${fails === 0 ? "DEV-MODE ACCUSE: ALL PASSED ✓" : fails + " FAILED ✗"} ===`);
} catch (e) {
  console.error("ERROR:", e.stack || e.message); fails++;
} finally {
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
}
