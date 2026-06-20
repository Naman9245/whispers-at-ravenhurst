// Drives two real Chrome tabs through the lobby into a live game and screenshots
// both, so we can eyeball the in-game layout (it only renders in the "playing"
// state, which needs two connected players).
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173";
const VW = 1600, VH = 900;
const devMode = process.argv.includes("--dev");

// Real mouse click on the button whose trimmed text === `text` (React-safe).
async function clickByText(page, text) {
  const buttons = await page.$$("button");
  for (const h of buttons) {
    const t = await h.evaluate((b) => b.textContent.trim());
    if (t === text) { await h.click(); return true; }
  }
  console.log(`  ! button not found: "${text}"`);
  return false;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  protocolTimeout: 240000,
  defaultViewport: { width: VW, height: VH },
  args: [`--window-size=${VW},${VH}`],
});

try {
  const holmes = await browser.newPage();
  await holmes.goto(URL, { waitUntil: "networkidle2" });
  await holmes.waitForSelector(".lobby");
  await clickByText(holmes, "Create Room");
  await holmes.waitForSelector(".lobby-form");
  if (devMode) {
    await holmes.click('.lb-check input[type="checkbox"]');
  }
  await clickByText(holmes, "Create");
  await holmes.waitForSelector(".lb-code-display");
  const code = (await holmes.$eval(".lb-code-display", (el) => el.textContent.trim()));
  console.log("room code:", code);

  const watson = await browser.newPage();
  await watson.setViewport({ width: VW, height: VH });
  await watson.goto(URL, { waitUntil: "networkidle2" });
  await watson.waitForSelector(".lobby");
  await clickByText(watson, "Join with Code");
  await watson.waitForSelector(".lb-input.code");
  await watson.type(".lb-input.code", code, { delay: 20 });
  await clickByText(watson, "Join");

  // Both should now be in the game.
  await Promise.all([
    holmes.waitForSelector(".hud-bar", { timeout: 15000 }),
    watson.waitForSelector(".hud-bar", { timeout: 15000 }),
  ]);
  await Promise.all([
    holmes.waitForSelector(".board-canvas"),
    watson.waitForSelector(".board-canvas"),
  ]);
  // let sprites + the first render settle
  await sleep(2500);

  await holmes.screenshot({ path: "holmes.png" });
  await watson.screenshot({ path: "watson.png" });
  console.log("saved holmes.png + watson.png");

  // Active state: Holmes searches the study → clue tracker fills, evidence list
  // populates, chat gets long clue text (wrap test), Rooms tab shows "searched".
  // Use ONLY page.evaluate for clicks (puppeteer's high-level .click() stalls
  // against the canvas rAF loop in this headless setup).
  const clickIdx = (page, sel, i) =>
    page.evaluate((s, n) => { const els = document.querySelectorAll(s); if (els[n]) els[n].click(); return Boolean(els[n]); }, sel, i);

  await clickIdx(holmes, ".action-bar button", 1);   // INVESTIGATE
  // poll until the evidence count goes up (or give up after ~10s)
  let evText = "EVIDENCE (0)";
  for (let i = 0; i < 12; i++) {
    await sleep(900);
    evText = await holmes.evaluate(() => document.querySelector(".nb-evidence-head")?.textContent || "n/a");
    if (!/\(0\)/.test(evText)) break;
  }
  console.log("evidence after investigate:", evText);
  await clickIdx(holmes, ".notebook-tabs button", 2); // ROOMS tab
  await sleep(800);
  await holmes.screenshot({ path: "holmes-active.png" });
  console.log("saved holmes-active.png");

  // Crisp close-ups via clip (element.screenshot hangs on pulsing nodes).
  const shot = async (sel, file, pad = 6) => {
    const box = await holmes.evaluate((s) => {
      const el = document.querySelector(s); if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, sel).catch(() => null);
    if (!box) return;
    const clip = {
      x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
      width: Math.min(VW, box.w + pad * 2), height: Math.min(VH, box.h + pad * 2),
    };
    await holmes.screenshot({ path: file, clip });
    console.log("saved", file);
  };
  await shot(".hud-clues", "close-clues.png");
  await shot(".chat-log", "close-chat.png");
  await shot(".notebook", "close-notebook.png");
} catch (e) {
  console.error("ERROR:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
