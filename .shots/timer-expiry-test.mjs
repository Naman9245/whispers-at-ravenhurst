// Reproduces the reported CRITICAL bug: when the game timer hits 0:00 with nobody
// having accused, the game must FORCE-RESOLVE — the reveal screen appears on BOTH
// clients, the board unmounts (no more movement), the truth + both forfeits show,
// and "Play Again" returns to the lobby.
//
// Drives two real Chrome tabs against the running client (localhost:5173) in DEV
// MODE (60s soft cap). Nobody accuses — the game must resolve itself at 0:00. Works
// against a fast-timer server too (8s cap); the client path is identical.
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

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new", protocolTimeout: 180000,
  defaultViewport: { width: VW, height: VH }, args: [`--window-size=${VW},${VH}`],
});
try {
  // --- Holmes creates a Dev-Mode room ---
  const holmes = await browser.newPage();
  await holmes.goto(URL, { waitUntil: "networkidle2" });
  await holmes.waitForSelector(".lobby");
  await clickByText(holmes, "Create Room");
  await holmes.waitForSelector(".lobby-form");
  await holmes.click('.lb-check input[type="checkbox"]'); // DEV MODE
  await clickByText(holmes, "Create");
  await holmes.waitForSelector(".lb-code-display");
  const code = await holmes.$eval(".lb-code-display", (el) => el.textContent.trim());

  // --- Watson joins ---
  const watson = await browser.newPage();
  await watson.setViewport({ width: VW, height: VH });
  await watson.goto(URL, { waitUntil: "networkidle2" });
  await watson.waitForSelector(".lobby");
  await clickByText(watson, "Join with Code");
  await watson.waitForSelector(".lb-input.code");
  await watson.type(".lb-input.code", code, { delay: 20 });
  await clickByText(watson, "Join");

  await holmes.waitForSelector(".board-canvas", { timeout: 15000 });
  await watson.waitForSelector(".board-canvas", { timeout: 15000 });
  // The dev movement handle is assigned after the sprite sheet loads — wait for it.
  await holmes.waitForFunction(() => !!window.__wrChar, { timeout: 10000 }).catch(() => {});
  await watson.waitForFunction(() => !!window.__wrChar, { timeout: 10000 }).catch(() => {});
  console.log("\n[1] Both detectives are in the manor. NObody will accuse.");

  // Prove the board is LIVE before expiry: each detective actually walks a few px.
  const walk = async (page, key = "d") => {
    await page.bringToFront();
    await page.mouse.click(VW / 2, VH / 2); // focus canvas / unlock audio
    const b = await page.evaluate(() => ({ x: window.__wrChar.x, y: window.__wrChar.y }));
    await page.keyboard.down(key); await sleep(350); await page.keyboard.up(key);
    const a = await page.evaluate(() => ({ x: window.__wrChar.x, y: window.__wrChar.y }));
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  ok("board is live for Holmes (walks before expiry)", (await walk(holmes)) > 1);
  ok("board is live for Watson (walks before expiry)", (await walk(watson)) > 1);

  // --- Do NOT accuse. Wait for the soft cap to force-resolve (poll up to 20s). ---
  console.log("\n[2] Waiting out the soft cap (nobody accuses)…");
  const t0 = Date.now();
  const revealH = await holmes.waitForSelector(".reveal-screen", { timeout: 75000 }).then(() => true).catch(() => false);
  const revealW = await watson.waitForSelector(".reveal-screen", { timeout: 75000 }).then(() => true).catch(() => false);
  console.log(`   reveal appeared after ~${((Date.now() - t0) / 1000).toFixed(1)}s`);
  ok("Holmes: reveal screen appears automatically at 0:00", revealH);
  ok("Watson: reveal screen appears automatically at 0:00", revealW);

  // --- The board must be GONE — no more movement/interaction possible. The reveal
  // screen replaces the whole game UI, so the canvas + HUD + action bar unmount and
  // the rAF/key listeners are torn down. Prove keys no longer move the character. ---
  const frozen = async (page) => {
    await page.bringToFront();
    const gone = await page.evaluate(() => !document.querySelector(".board-canvas") && !document.querySelector(".action-bar") && !document.querySelector(".hud-bar"));
    // __wrChar lingers as an inert object; its position must NOT change on keypress.
    const b = await page.evaluate(() => (window.__wrChar ? { x: window.__wrChar.x, y: window.__wrChar.y } : null));
    await page.keyboard.down("d"); await sleep(300); await page.keyboard.up("d");
    const a = await page.evaluate(() => (window.__wrChar ? { x: window.__wrChar.x, y: window.__wrChar.y } : null));
    const still = !b || (a.x === b.x && a.y === b.y);
    return gone && still;
  };
  ok("Holmes: game UI unmounted + character frozen (cannot move)", await frozen(holmes));
  ok("Watson: game UI unmounted + character frozen (cannot move)", await frozen(watson));

  // --- Truth revealed + both forfeited. ---
  const truth = await holmes.evaluate(() => document.querySelector(".rs-triple")?.textContent?.trim() || "");
  console.log("   THE TRUTH:", truth);
  ok("Holmes: the truth (culprit / room / weapon) is shown", truth.length > 10);
  const forfeits = await holmes.evaluate(() => document.querySelectorAll(".rc-forfeit").length);
  ok("both players are marked Forfeited (2 forfeit cards)", forfeits === 2);
  const banner = await holmes.evaluate(() => document.querySelector(".reveal-banner")?.textContent?.trim() || "");
  console.log("   banner:", JSON.stringify(banner));
  ok("draw/no-winner headline shown for a double forfeit", /no one|draw/i.test(banner));

  await holmes.bringToFront(); // foreground before capture (new-headless throttles bg tabs)
  await holmes.screenshot({ path: ".shots/timer-expiry-reveal.png" });

  // --- Play Again returns to the lobby. ---
  console.log("\n[3] Play Again → lobby.");
  await holmes.bringToFront(); // avoid new-headless background-tab throttling
  await holmes.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Play Again")?.click());
  const backToLobby = await holmes.waitForSelector(".lobby", { timeout: 8000 }).then(() => true).catch(() => false);
  ok("Play Again returns Holmes to the lobby", backToLobby);

  console.log(`\n=== ${fails === 0 ? "TIMER-EXPIRY: ALL PASSED ✓" : fails + " FAILED ✗"} ===`);
} catch (e) {
  console.error("ERROR:", e.stack || e.message); fails++;
} finally {
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
}
