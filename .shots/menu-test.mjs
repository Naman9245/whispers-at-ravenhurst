// Phase 2.7 e2e: the cinematic main menu (+ the menu/lobby continuity fix-up).
// Drives the REAL entry URL (no ?menu=skip — this suite is the one that
// exercises the menu itself): typewriter title, random tagline, idle-mansion
// ghosts (via the dev window.__wrMenu handle), rain-after-first-gesture, hover
// swish, the Detective's Desk panel (sound toggle + dev-mode default → lobby
// carry-over), the Case Files panel (CREDITS.md rendered + version), Begin
// Investigation (door creak + content fade → the lobby OVER THE SAME LIVING
// BACKDROP — a __wrMenu marker proves the scene is never remounted, and the
// rain carries through), the lobby's menu-style entry buttons + themed ← Back
// (round-trips to the menu without a scene restart), and the full cycle:
// dev-mode game (backdrop fully unmounted) → reveal → "Main Menu" returns to a
// FRESH menu scene with no leaked errors.
// Needs client (:5173) + server (:3001) running.
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173", VW = 1600, VH = 900;
let fails = 0;
const ok = (l, c) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${l}`); if (!c) fails++; };
// Menu buttons contain icon spans, so match on inclusion (trimmed).
const clickByText = async (p, t) => { for (const h of await p.$$("button")) if ((await h.evaluate(b => b.textContent.trim())).includes(t)) { await h.click(); return true; } return false; };
const aud = (p) => p.evaluate(() => (window.__wrAudio ? window.__wrAudio.state() : null));
const menuState = (p) => p.evaluate(() => (window.__wrMenu ? window.__wrMenu.state() : null));

// Must mirror TAGLINES in client/src/components/MainMenu.jsx.
const TAGLINES = [
  "Only one detective uncovers the truth.",
  "Every room remembers.",
  "Trust the evidence. Not the people.",
  "Someone is lying.",
  "Every clue changes the story.",
];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new", protocolTimeout: 180000,
  defaultViewport: { width: VW, height: VH },
  args: [`--window-size=${VW},${VH}`, "--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
try {
  const h = await browser.newPage();
  h.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  h.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });
  await h.goto(URL, { waitUntil: "networkidle2" });

  console.log("\n[0] MENU RENDERS FIRST: no lobby until Begin Investigation.");
  await h.waitForSelector(".main-menu", { timeout: 5000 });
  ok("main menu rendered on load", (await h.$(".main-menu")) !== null);
  ok("lobby NOT rendered yet", (await h.$(".lobby")) === null);
  ok("idle-mansion canvas present", (await h.$(".mm-canvas")) !== null);

  console.log("\n[1] TYPEWRITER TITLE + TAGLINE.");
  await sleep(1500);   // typewriter finishes in ~0.8s
  const title = await h.$eval(".mm-title", (el) => el.textContent.trim());
  ok(`title fully typed ("${title}")`, title === "WHISPERS ATRAVENHURST");
  const tagline = await h.$eval(".mm-tagline", (el) => el.textContent.trim());
  ok(`tagline from the pool ("${tagline}")`, TAGLINES.includes(tagline));

  console.log("\n[2] GHOST DETECTIVES: wander the mansion (dev __wrMenu handle).");
  const haveGhosts = await h.waitForFunction(
    () => window.__wrMenu && window.__wrMenu.state().ghosts.length === 2,
    { timeout: 6000 }
  ).then(() => true).catch(() => false);
  ok("both ghosts spawned (sprites loaded)", haveGhosts);
  if (haveGhosts) {
    const s0 = await menuState(h);
    await sleep(5500);   // idle is 2–4s max, so any 5.5s window must include movement
    const s1 = await menuState(h);
    const moved = s0.ghosts.some((g, i) =>
      Math.hypot(g.x - s1.ghosts[i].x, g.y - s1.ghosts[i].y) > 4);
    ok("ghosts actually moved over 5.5s", moved);
    ok("ghosts stayed on the board", s1.ghosts.every((g) => g.x > 0 && g.x < 1328 && g.y > 0 && g.y < 860));
  }

  console.log("\n[3] AUDIO: rain after the first gesture; hover plays the notebook swish.");
  let s = await aud(h);
  ok("no rain before any gesture (autoplay lock)", s.playing.rain === false);
  await h.mouse.click(VW / 2, 80);   // neutral click = unlock gesture
  await sleep(400);
  s = await aud(h);
  ok("rain starts after the first gesture", s.playing.rain === true);
  const swishBefore = s.plays.notebookOpen || 0;
  await h.hover(".mm-btn");          // hover the first case-file entry
  await sleep(150);
  s = await aud(h);
  ok("button hover → notebook swish", (s.plays.notebookOpen || 0) > swishBefore);

  console.log("\n[4] DETECTIVE'S DESK: sound toggle + dev-mode default.");
  await clickByText(h, "Detective");
  await h.waitForSelector(".mm-panel");
  ok("desk panel opened", (await h.$(".mm-panel")) !== null);
  ok("Fullscreen row present", await h.$$eval(".menu-item", (els) => els.some((e) => e.textContent.includes("Fullscreen"))));
  await h.$$eval(".menu-item", (els) => els.find((e) => e.textContent.includes("Sound"))?.click());
  await sleep(200);
  s = await aud(h);
  ok("desk Sound toggle mutes (rain stops)", s.muted === true && s.playing.rain === false);
  await h.$$eval(".menu-item", (els) => els.find((e) => e.textContent.includes("Sound"))?.click());
  await sleep(250);
  s = await aud(h);
  ok("desk Sound toggle unmutes (rain resumes)", s.muted === false && s.playing.rain === true);
  await h.$$eval(".menu-item", (els) => els.find((e) => e.textContent.includes("Dev Mode"))?.click());
  const devDefault = await h.evaluate(() => localStorage.getItem("wr.devModeDefault"));
  ok('dev-mode default persisted ("wr.devModeDefault" = "1")', devDefault === "1");
  await h.keyboard.press("Escape"); await sleep(150);
  ok("Escape closes the desk panel", (await h.$(".mm-panel")) === null);

  console.log("\n[5] CASE FILES: CREDITS.md rendered + version + builder credit.");
  await clickByText(h, "Case Files");
  await h.waitForSelector(".mm-panel.files");
  await h.waitForSelector(".mm-credits-table", { timeout: 4000 }).catch(() => {});
  ok("credits table rendered from CREDITS.md", (await h.$(".mm-credits-table")) !== null);
  const filesText = await h.$eval(".mm-panel.files", (el) => el.textContent);
  ok("version v0.9.0 shown", filesText.includes("v0.9.0"));
  ok("builder credit shown", filesText.includes("Namandeep Singh Virdi"));
  ok("GitHub repo link shown", filesText.includes("github.com/Naman9245/whispers-at-ravenhurst"));
  await h.keyboard.press("Escape"); await sleep(150);

  console.log("\n[6] BEGIN INVESTIGATION: door creak → content fade → the EXISTING lobby, SAME scene.");
  // Tag the running scene so we can prove the backdrop is never remounted
  // across menu ⇄ lobby (a remount = fresh __wrMenu = the marker vanishes).
  await h.evaluate(() => { if (window.__wrMenu) window.__wrMenu.__marker = "continuity"; });
  s = await aud(h);
  const creaksBefore = s.plays.doorCreak || 0;
  const clicksBefore = s.plays.buttonClick || 0;
  await clickByText(h, "Begin Investigation");
  await sleep(150);
  s = await aud(h);
  ok("door creak fired on Begin", (s.plays.doorCreak || 0) > creaksBefore);
  ok("Begin did NOT fire the generic click (data-sound off)", (s.plays.buttonClick || 0) === clicksBefore);
  await h.waitForSelector(".lobby", { timeout: 2000 });
  ok("lobby appeared after the ~300ms content fade", (await h.$(".lobby")) !== null);
  ok("main menu content unmounted", (await h.$(".main-menu")) === null);
  ok("idle-mansion backdrop STILL under the lobby", (await h.$(".mm-canvas")) !== null);
  ok("backdrop never remounted (scene marker survived)",
    (await h.evaluate(() => window.__wrMenu?.__marker)) === "continuity");
  await sleep(300);
  s = await aud(h);
  ok("rain CONTINUES in the lobby (same scene, storm carries through)", s.playing.rain === true);

  console.log("\n[6b] LOBBY RESTYLE: menu-style entry buttons + themed back button.");
  const entryBtns = await h.$$eval(".lobby-actions .mm-btn", (els) =>
    els.map((e) => ({ text: e.textContent.trim(), icon: e.dataset.icon || "" })));
  ok("Create Room is an mm-btn with an icon (textContent stays exact)",
    entryBtns.some((b) => b.text === "Create Room" && b.icon.length > 0));
  ok("Join with Code is an mm-btn with an icon (textContent stays exact)",
    entryBtns.some((b) => b.text === "Join with Code" && b.icon.length > 0));
  ok("themed ← Back button present (top-left)", (await h.$(".lobby-back")) !== null);

  console.log("\n[6c] ← BACK: returns to the menu; the scene never restarts.");
  await clickByText(h, "← Back");
  await h.waitForSelector(".main-menu", { timeout: 2000 });
  ok("back on the main menu", (await h.$(".main-menu")) !== null);
  ok("backdrop STILL never remounted (marker intact)",
    (await h.evaluate(() => window.__wrMenu?.__marker)) === "continuity");
  s = await aud(h);
  ok("rain uninterrupted through the round-trip", s.playing.rain === true);
  await clickByText(h, "Begin Investigation");   // head back to the lobby for [7]
  await h.waitForSelector(".lobby", { timeout: 2000 });

  console.log("\n[7] DESK CARRY-OVER: Dev Mode default pre-checks the lobby checkbox.");
  await clickByText(h, "Create Room");
  await h.waitForSelector(".lobby-form");
  const preChecked = await h.$eval('.lb-check input[type="checkbox"]', (el) => el.checked);
  ok("Dev Mode checkbox pre-checked from the desk default", preChecked === true);

  console.log("\n[8] FULL CYCLE: dev game → reveal → Main Menu returns to the menu.");
  await clickByText(h, "Create");   // dev mode already checked via the default
  await h.waitForSelector(".lb-code-display");
  const code = await h.$eval(".lb-code-display", (e) => e.textContent.trim());
  ok(`room code is the raw code (no CASE # in text): "${code}"`, /^[A-Z0-9]{5}$/.test(code));
  const w = await browser.newPage(); await w.setViewport({ width: VW, height: VH });
  await w.goto(URL, { waitUntil: "networkidle2" });
  await w.waitForSelector(".main-menu");
  await clickByText(w, "Begin Investigation");
  await w.waitForSelector(".lobby", { timeout: 2000 });
  await clickByText(w, "Join with Code");
  await w.waitForSelector(".lb-input.code");
  await w.type(".lb-input.code", code, { delay: 20 });
  await clickByText(w, "Join");
  await h.waitForSelector(".board-canvas", { timeout: 15000 });
  ok("game started from the menu-first flow", true);
  ok("menu backdrop fully unmounted during gameplay (no __wrMenu, no canvas)",
    (await h.evaluate(() => window.__wrMenu === undefined)) && (await h.$(".mm-canvas")) === null);
  await h.bringToFront(); await h.mouse.click(VW / 2, VH / 2);
  await sleep(400);
  s = await aud(h);
  ok("rain playing in-game", s.playing.rain === true);
  console.log("  (…waiting out the 60s dev soft cap for the reveal)");
  await h.waitForSelector(".reveal-screen", { timeout: 90000 });
  await clickByText(h, "Main Menu");
  await h.waitForSelector(".main-menu", { timeout: 3000 });
  ok("Main Menu button returns to the cinematic menu", (await h.$(".main-menu")) !== null);
  await sleep(500);
  s = await aud(h);
  ok("rain resumed on the menu (already unlocked)", s.playing.rain === true);
  const back = await h.waitForFunction(
    () => window.__wrMenu && window.__wrMenu.state().ghosts.length === 2,
    { timeout: 6000 }
  ).then(() => true).catch(() => false);
  ok("menu scene restarted cleanly (ghosts respawned)", back);
  ok("post-game backdrop is a FRESH scene (old marker gone)",
    (await h.evaluate(() => window.__wrMenu?.__marker)) === undefined);

  console.log("\n[errors]:", errors.length ? errors.slice(0, 6).join(" | ") : "none");
  ok("no console/page errors across the whole cycle", errors.length === 0);
  console.log(`\n=== ${fails === 0 ? "MENU 2.7: ALL PASSED ✓" : fails + " CHECK(S) FAILED ✗"} ===`);
} catch (e) {
  console.error("ERROR:", e.stack || e.message);
  console.log("recent errors:", errors.slice(-6).join(" | "));
  fails++;
} finally {
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
}
