// Fresh current-build screenshots: full normal-state layout + chat close-up.
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173";
const VW = 1600, VH = 900;
const clickByText = async (page, text) => {
  for (const h of await page.$$("button")) if ((await h.evaluate((b) => b.textContent.trim())) === text) { await h.click(); return true; }
  return false;
};
const pos = (p) => p.evaluate(() => ({ x: window.__wrChar.x, y: window.__wrChar.y }));
async function moveTo(page, tx, ty, tol = 12, max = 200) {
  let stuck = 0, prev = null;
  for (let i = 0; i < max; i++) {
    const p = await pos(page); const dx = tx - p.x, dy = ty - p.y;
    if (Math.hypot(dx, dy) < tol) return true;
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1.5) { if (++stuck > 8) return false; } else stuck = 0; prev = p;
    const keys = []; if (Math.abs(dx) > tol) keys.push(dx > 0 ? "d" : "a"); if (Math.abs(dy) > tol) keys.push(dy > 0 ? "s" : "w");
    for (const k of keys) await page.keyboard.down(k); await sleep(70); for (const k of keys) await page.keyboard.up(k); await sleep(15);
  }
  return false;
}
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 120000, defaultViewport: { width: VW, height: VH }, args: [`--window-size=${VW},${VH}`] });
try {
  const holmes = await browser.newPage();
  await holmes.goto(URL, { waitUntil: "networkidle2" });
  await holmes.waitForSelector(".lobby");
  await clickByText(holmes, "Create Room");
  await holmes.waitForSelector(".lobby-form");
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
  await sleep(1800);
  await holmes.bringToFront();
  await holmes.mouse.click(VW / 2, VH / 2);
  // populate chat with a long clue line (to show 1-line truncation)
  await holmes.evaluate(() => document.querySelectorAll(".action-bar button")[1].click());
  await sleep(700);
  await moveTo(holmes, 236, 430); await moveTo(holmes, 236, 614);
  await holmes.evaluate(() => document.querySelectorAll(".action-bar button")[1].click());
  await sleep(700);
  await moveTo(holmes, 236, 430); // back to corridor so the room glow is clean
  await sleep(400);
  await holmes.screenshot({ path: "current-full.png" });
  console.log("saved current-full.png");
  const shot = async (sel, file, pad = 6) => {
    const box = await holmes.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
    if (!box) return;
    await holmes.screenshot({ path: file, clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.w + pad * 2, height: box.h + pad * 2 } });
    console.log("saved", file);
  };
  await shot(".chat-log", "current-chat.png");
} catch (e) { console.error("ERROR:", e.stack || e.message); process.exitCode = 1; }
finally { await browser.close(); }
