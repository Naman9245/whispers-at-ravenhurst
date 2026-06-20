// Captures the final-minute URGENCY visuals. Run the server with
// WHISPERS_FAST_TIMERS=1 (8s soft cap) so the urgent state (≤60s left) is on
// from the start: red pulsing timer + red edge vignette, no banner.
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173";
const VW = 1600, VH = 900;
const clickByText = async (page, text) => {
  for (const h of await page.$$("button")) {
    if ((await h.evaluate((b) => b.textContent.trim())) === text) { await h.click(); return true; }
  }
  return false;
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new", protocolTimeout: 120000,
  defaultViewport: { width: VW, height: VH }, args: [`--window-size=${VW},${VH}`],
});
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
  await sleep(900); // into the (always-urgent, 8s) game

  const urgent = await holmes.evaluate(() => ({
    timerUrgent: !!document.querySelector(".hud-timer.urgent"),
    timerColor: getComputedStyle(document.querySelector(".hud-timer .tb-time")).color,
    timerText: document.querySelector(".hud-timer .tb-time")?.textContent,
    vignette: !!document.querySelector(".vignette-edges"),
    banner: !!document.querySelector(".window-banner"),
    accuseUrgent: !!document.querySelector(".act-btn.accuse.urgent"),
  }));
  console.log("urgency state:", JSON.stringify(urgent, null, 2));
  await holmes.screenshot({ path: "urgency-state.png" });
  console.log("saved urgency-state.png");
} catch (e) {
  console.error("ERROR:", e.stack || e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
