// One-off screenshots of the Phase 2.7 main menu (menu + Case Files panel).
// Run from the repo root: node .shots/menu-shot.mjs
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173", VW = 1600, VH = 900;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  defaultViewport: { width: VW, height: VH }, args: [`--window-size=${VW},${VH}`],
});
try {
  const p = await browser.newPage();
  await p.goto(URL, { waitUntil: "networkidle2" });
  await p.waitForSelector(".main-menu");
  await sleep(2500);   // typewriter done, ghosts wandering
  await p.screenshot({ path: ".shots/menu-1-main.png" });
  for (const h of await p.$$("button")) {
    if ((await h.evaluate((b) => b.textContent)).includes("Case Files")) { await h.click(); break; }
  }
  await p.waitForSelector(".mm-credits-table", { timeout: 4000 }).catch(() => {});
  await sleep(300);
  await p.screenshot({ path: ".shots/menu-2-casefiles.png" });
  console.log("saved .shots/menu-1-main.png + .shots/menu-2-casefiles.png");
} finally {
  await browser.close();
}
