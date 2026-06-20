import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173", VW = 1600, VH = 900;
const clickByText = async (p, t) => { for (const h of await p.$$("button")) if ((await h.evaluate(b => b.textContent.trim())) === t) { await h.click(); return true; } return false; };
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 120000, defaultViewport: { width: VW, height: VH }, args: [`--window-size=${VW},${VH}`] });
try {
  const h = await browser.newPage();
  await h.goto(URL, { waitUntil: "networkidle2" });
  await h.waitForSelector(".lobby"); await clickByText(h, "Create Room");
  await h.waitForSelector(".lobby-form"); await clickByText(h, "Create");
  await h.waitForSelector(".lb-code-display");
  const code = await h.$eval(".lb-code-display", e => e.textContent.trim());
  const w = await browser.newPage(); await w.setViewport({ width: VW, height: VH });
  await w.goto(URL, { waitUntil: "networkidle2" });
  await w.waitForSelector(".lobby"); await clickByText(w, "Join with Code");
  await w.waitForSelector(".lb-input.code"); await w.type(".lb-input.code", code, { delay: 20 }); await clickByText(w, "Join");
  await h.waitForSelector(".board-canvas"); await sleep(1800);
  await h.bringToFront(); await h.mouse.click(VW / 2, VH / 2);
  // generate real chat: investigate study
  await h.evaluate(() => document.querySelectorAll(".act-btn")[1].click());
  await sleep(900);
  // open activity
  await h.evaluate(() => [...document.querySelectorAll(".hud-tool")].find(b => /Activity/.test(b.textContent)).click());
  await sleep(500);
  const dump = await h.evaluate(() => ({
    lines: document.querySelectorAll(".activity-line").length,
    html: document.querySelector(".activity-list")?.innerText?.slice(0, 400),
  }));
  console.log("activity lines:", dump.lines);
  console.log("activity text:\n" + dump.html);
  await h.screenshot({ path: "debug-activity.png" });
} catch (e) { console.error("ERR", e.message); } finally { await browser.close(); }
