// Room lifecycle + modal keyboard e2e.
//
// Covers the bug class that had NO coverage before: leaving a game was purely a
// client-side state reset, so the GameRoom kept running server-side. Its soft cap
// would later fire and push a `game:reveal` at a player who was sitting in the
// lobby — or in a brand-new room — yanking them out of it; the opponent was never
// told their rival had walked away; and no exit path ever deleted the room, so
// every finished/abandoned game leaked in RoomStore for the process lifetime.
//
// Also asserts that forfeiting is not a way to win (a double forfeit must read
// "No one cracked the case.", not "A draw — both detectives prevail.") and that
// the modals honour the Esc/Enter contract the in-game help advertises.
//
// Needs client (:5173) + server (:3001) running — a normal `npm run dev`.
// Uses DEV MODE (60s soft cap) so the abandoned game resolves quickly.
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173/?menu=skip", VW = 1600, VH = 900;
let fails = 0;
const ok = (l, c) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${l}`); if (!c) fails++; };
const clickByText = async (p, t) => { for (const h of await p.$$("button")) if ((await h.evaluate(b => b.textContent.trim())) === t) { await h.click(); return true; } return false; };
const openMenu = (p) => p.evaluate(() => [...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === "Menu")?.click());
const clickMenuItem = (p, re) => p.evaluate((r) => [...document.querySelectorAll(".menu-item")].find(b => new RegExp(r).test(b.textContent))?.click(), re);
const openRooms = async () => (await (await fetch("http://localhost:3001/health")).json()).rooms;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new", protocolTimeout: 240000,
  defaultViewport: { width: VW, height: VH },
  args: [`--window-size=${VW},${VH}`, "--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
try {
  const baseRooms = await openRooms();

  const h = await browser.newPage();
  h.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  h.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });
  await h.goto(URL, { waitUntil: "networkidle2" });
  await h.waitForSelector(".lobby"); await clickByText(h, "Create Room");
  await h.waitForSelector(".lobby-form"); await h.click('.lb-check input[type="checkbox"]'); await clickByText(h, "Create");
  await h.waitForSelector(".lb-code-display");
  const code = await h.$eval(".lb-code-display", e => e.textContent.trim());

  const w = await browser.newPage(); await w.setViewport({ width: VW, height: VH });
  await w.on("pageerror", (e) => errors.push("PAGEERROR(w): " + e.message));
  await w.goto(URL, { waitUntil: "networkidle2" });
  await w.waitForSelector(".lobby"); await clickByText(w, "Join with Code");
  await w.waitForSelector(".lb-input.code"); await w.type(".lb-input.code", code, { delay: 20 }); await clickByText(w, "Join");
  await h.waitForSelector(".board-canvas"); await w.waitForSelector(".board-canvas");
  const startedAt = Date.now();
  await sleep(1500);
  console.log(`\n[0] Dev-mode game ${code} running (60s soft cap).`);
  ok("both tabs are in the game", true);

  console.log("\n[1] MODAL KEYS: the Esc/Enter contract the in-game help advertises.");
  await h.bringToFront();
  await clickByText(h, "QUESTION"); await h.waitForSelector(".suspect-modal");
  await h.keyboard.press("Escape"); await sleep(350);
  ok("Esc closes the suspect modal", !(await h.$(".suspect-modal")));
  // The trigger pill must not keep focus, or Enter re-activates it and re-opens.
  await h.keyboard.press("Enter"); await sleep(350);
  ok("Enter does NOT re-open it (trigger button was blurred)", !(await h.$(".suspect-modal")));
  await clickByText(h, "QUESTION"); await h.waitForSelector(".suspect-modal");
  await h.keyboard.press("Enter"); await sleep(350);
  ok("Enter closes the suspect modal", !(await h.$(".suspect-modal")));

  console.log("\n[2] EXAMINE MODAL: really auto-closes after 5s (App re-renders every 1s).");
  await h.evaluate(() => { const r = { x: 44, y: 120, w: 384, h: 252 }; window.__wrChar.x = r.x + 0.5 * r.w; window.__wrChar.y = r.y + 0.5 * r.h; });
  await sleep(400);
  await h.keyboard.down("e"); await sleep(150); await h.keyboard.up("e");
  await h.waitForSelector(".examine-modal", { timeout: 8000 });
  await sleep(7000);
  ok("examine modal auto-closed (5s timer not reset by the countdown heartbeat)", !(await h.$(".examine-modal")));

  console.log("\n[3] EXIT GAME: the server actually drops the player.");
  await openMenu(h); await sleep(300);
  await clickMenuItem(h, "Exit Game"); await sleep(1200);
  ok("Holmes is back on the lobby UI", !!(await h.$(".lobby")));
  const wToast = await w.evaluate(() => document.querySelector(".toast")?.textContent?.trim() || "");
  ok(`Watson is told his rival left ("${wToast}")`, /left the game/i.test(wToast));

  console.log("\n[4] NO HIJACK: the abandoned game must not drag Holmes back.");
  await clickByText(h, "Create Room"); await h.waitForSelector(".lobby-form");
  await clickByText(h, "Create"); await h.waitForSelector(".lb-code-display");
  const code2 = await h.$eval(".lb-code-display", e => e.textContent.trim());
  console.log(`  Holmes is now waiting in a NEW room ${code2}; waiting out the old 60s cap…`);
  while (Date.now() - startedAt < 68000) await sleep(3000);
  await sleep(3000);
  ok("Holmes was NOT thrown into the old game's reveal", !(await h.$(".reveal-screen")));
  ok("Holmes is still waiting in his new room", (await h.$eval(".lb-code-display", e => e.textContent.trim()).catch(() => "")) === code2);
  ok("Watson (still in the old game) got his reveal", !!(await w.$(".reveal-screen")));

  console.log("\n[5] SCORING: forfeiting is not a way to win.");
  const banner = await w.evaluate(() => document.querySelector(".reveal-banner")?.textContent?.trim() || "");
  console.log(`   banner: "${banner}"`);
  ok("double forfeit reads 'No one cracked the case.' (not a draw)", /no one cracked/i.test(banner));

  console.log("\n[6] REAPING: ended/abandoned rooms are deleted, not leaked.");
  await w.bringToFront(); await clickByText(w, "Main Menu"); await sleep(1000);
  await h.close(); await w.close(); await sleep(1200);
  const after = await openRooms();
  console.log(`   RoomStore: ${baseRooms} before → ${after} after`);
  ok("only Holmes's still-open lobby may remain (nothing leaked)", after <= baseRooms + 1);

  console.log("\n[errors]:", errors.length ? "\n" + errors.join("\n") : " none");
  ok("no console/page errors", errors.length === 0);
} catch (e) { console.error("SCRIPT ERROR:", e.message); fails++; }
finally {
  await browser.close();
  console.log(`\n=== ROOM LIFECYCLE: ${fails === 0 ? "ALL PASSED ✓" : fails + " FAILED ✗"} ===`);
  process.exit(fails ? 1 : 0);
}
