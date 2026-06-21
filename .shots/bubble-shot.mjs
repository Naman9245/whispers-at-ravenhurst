// Close-up of the cute cloud speech bubble during a hotspot search.
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173", VW = 1600, VH = 900, BOARD_W = 1472, BOARD_H = 860;
const clickByText = async (p, t) => { for (const h of await p.$$("button")) if ((await h.evaluate(b => b.textContent.trim())) === t) { await h.click(); return true; } return false; };
const pos = (p) => p.evaluate(() => ({ x: window.__wrChar.x, y: window.__wrChar.y }));
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
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 120000, defaultViewport: { width: VW, height: VH }, args: [`--window-size=${VW},${VH}`] });
try {
  const h = await browser.newPage();
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
  await moveTo(h, 44 + 0.5 * 384, 120 + 0.5 * 252); // study_desk
  await h.keyboard.down("e"); await sleep(120); await h.keyboard.up("e");
  await sleep(700); // mid-search, puff-in done, dots bouncing
  const rect = await h.evaluate(() => { const c = document.querySelector(".board-canvas"); const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height }; });
  const p = await pos(h);
  const sx = rect.left + p.x * (rect.w / BOARD_W);
  const sy = rect.top + p.y * (rect.h / BOARD_H);
  const clip = { x: Math.max(0, sx - 170), y: Math.max(0, sy - 190), width: 340, height: 250 };
  await h.screenshot({ path: "bubble-closeup.png", clip });
  console.log("saved bubble-closeup.png");
} catch (e) { console.error("ERR", e.message); } finally { await browser.close(); }
