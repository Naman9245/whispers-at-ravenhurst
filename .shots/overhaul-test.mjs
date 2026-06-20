// Full overhaul playtest: new minimalist layout, lock-in lockout, slide-in
// panels (with the 100-message growth test), movement, and screenshots.
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173";
const VW = 1600, VH = 900;
let fails = 0;
const ok = (l, c) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${l}`); if (!c) fails++; };
const clickByText = async (page, text) => {
  for (const h of await page.$$("button")) if ((await h.evaluate((b) => b.textContent.trim())) === text) { await h.click(); return true; }
  return false;
};
const pos = (p) => p.evaluate(() => window.__wrChar ? { x: window.__wrChar.x, y: window.__wrChar.y, room: window.__wrChar.anchorRoom } : null);
const COLX = { 0: 236, 1: 736, 2: 1236 }, ROWY = { 0: 246, 1: 614 }, CORY = 430;
const CELL = { study: [0, 0], dining: [1, 0], lounge: [2, 0], library: [0, 1], kitchen: [1, 1], conservatory: [2, 1] };
async function moveTo(page, tx, ty, tol = 12, max = 220) {
  let stuck = 0, prev = null;
  for (let i = 0; i < max; i++) {
    const p = await pos(page); if (!p) return false; const dx = tx - p.x, dy = ty - p.y;
    if (Math.hypot(dx, dy) < tol) return true;
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1.5) { if (++stuck > 8) return false; } else stuck = 0; prev = p;
    const keys = []; if (Math.abs(dx) > tol) keys.push(dx > 0 ? "d" : "a"); if (Math.abs(dy) > tol) keys.push(dy > 0 ? "s" : "w");
    for (const k of keys) await page.keyboard.down(k); await sleep(70); for (const k of keys) await page.keyboard.up(k); await sleep(15);
  }
  return false;
}
async function enter(page, room) {
  const [tc, tr] = CELL[room]; const cur = await pos(page); const cc = cur.room ? CELL[cur.room][0] : tc;
  await moveTo(page, COLX[cc], CORY, 14); await moveTo(page, COLX[tc], CORY, 14); await moveTo(page, COLX[tc], ROWY[tr], 16);
  const want = room === "dining" ? "DINING HALL" : room.toUpperCase();
  return (await page.evaluate(() => document.querySelector(".hp-room")?.textContent || "")).toUpperCase().includes(want);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 240000, defaultViewport: { width: VW, height: VH }, args: [`--window-size=${VW},${VH}`] });
const errors = [];
try {
  const holmes = await browser.newPage();
  holmes.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  holmes.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });
  await holmes.goto(URL, { waitUntil: "networkidle2" });
  await holmes.waitForSelector(".lobby");
  await clickByText(holmes, "Create Room");
  await holmes.waitForSelector(".lobby-form");
  await holmes.click('.lb-check input[type="checkbox"]'); // DEV badge
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
  await sleep(2000);
  await holmes.bringToFront();
  await holmes.mouse.click(VW / 2, VH / 2);

  // ---- Layout ----
  console.log("\n[layout]");
  const L = await holmes.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
    const hud = r(".hud-bar"), board = r(".board-canvas"), pills = document.querySelectorAll(".act-btn").length;
    return {
      hudH: hud ? Math.round(hud.height) : 0,
      boardH: board ? Math.round(board.height) : 0, boardW: board ? Math.round(board.width) : 0,
      vh: window.innerHeight, vw: window.innerWidth, pills,
      chatGone: !document.querySelector(".chat-log"),
      notebookHidden: !document.querySelector(".notebook-sidebar"),
      tools: [...document.querySelectorAll(".hud-tool")].map(b => b.textContent.replace(/\s+/g, " ").trim()),
    };
  });
  console.log("   HUD height:", L.hudH, "| board:", L.boardW + "x" + L.boardH, `(${(L.boardH / L.vh * 100).toFixed(0)}% vh, ${(L.boardW / L.vw * 100).toFixed(0)}% vw)`, "| pills:", L.pills);
  console.log("   tools:", JSON.stringify(L.tools));
  ok("HUD bar ~70px tall", L.hudH >= 60 && L.hudH <= 80);
  ok("board is the hero (>=78% of viewport height)", L.boardH / L.vh >= 0.78);
  ok("4 action pills present", L.pills === 4);
  ok("chat log NOT in permanent view", L.chatGone);
  ok("notebook NOT in permanent view", L.notebookHidden);
  await holmes.screenshot({ path: "ov-1-layout.png" });

  // ---- Movement: all 6 rooms + free 4-dir ----
  console.log("\n[movement]");
  for (const room of ["library", "kitchen", "conservatory", "lounge", "dining", "study"]) {
    ok(`enter ${room}`, await enter(holmes, room));
  }
  // free 4-directional inside study (currently in study)
  const p0 = await pos(holmes);
  const dirs = {};
  for (const [k, key] of [["right", "d"], ["left", "a"], ["down", "s"], ["up", "w"]]) {
    const a = await pos(holmes);
    await holmes.keyboard.down(key); await sleep(280); await holmes.keyboard.up(key); await sleep(120);
    const b = await pos(holmes);
    dirs[k] = Math.hypot(b.x - a.x, b.y - a.y) > 5;
  }
  console.log("   free-move study:", JSON.stringify(dirs));
  ok("free 4-directional movement inside a room", dirs.right && dirs.left && dirs.down && dirs.up);

  // ---- Activity panel: open, slide-in, 100-message growth test ----
  console.log("\n[activity panel]");
  await holmes.evaluate(() => [...document.querySelectorAll(".hud-tool")].find(b => /Activity/.test(b.textContent)).click());
  await sleep(400);
  const aOpen = await holmes.evaluate(() => !!document.querySelector(".activity-panel"));
  ok("activity panel opens from the LEFT badge", aOpen);
  const aBox1 = await holmes.evaluate(() => { const e = document.querySelector(".activity-panel"); const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) }; });
  console.log("   panel box:", JSON.stringify(aBox1), "vh60=", Math.round(0.6 * VH));
  // inject 100 mock messages directly into the DOM list and re-measure
  await holmes.evaluate(() => { const ul = document.querySelector(".activity-list"); for (let i = 0; i < 100; i++) { const li = document.createElement("li"); li.className = "activity-line"; li.textContent = "[Mock] a very long activity message number " + i + " that should be truncated and never widen the panel at all"; ul.appendChild(li); } });
  await sleep(300);
  const aBox2 = await holmes.evaluate(() => { const e = document.querySelector(".activity-panel"); const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
  console.log("   panel box after 100 msgs:", JSON.stringify(aBox2));
  ok("activity panel width ≤ 280px", aBox1.w <= 280 && aBox2.w <= 280);
  ok("activity panel height ≤ 60vh", aBox1.h <= Math.round(0.6 * VH) + 1 && aBox2.h <= Math.round(0.6 * VH) + 1);
  ok("panel does NOT grow with 100 messages", aBox2.w === aBox1.w && aBox2.h === aBox1.h);
  await holmes.screenshot({ path: "ov-2-activity.png" });
  // close by clicking outside (scrim)
  await holmes.evaluate(() => document.querySelector(".panel-scrim")?.click());
  await sleep(300);
  ok("activity panel closes on outside click", await holmes.evaluate(() => !document.querySelector(".activity-panel")));

  // ---- Notebook sidebar: open from right, width, no auto-close ----
  console.log("\n[notebook sidebar]");
  await holmes.evaluate(() => [...document.querySelectorAll(".hud-tool")].find(b => /Notebook/.test(b.textContent)).click());
  await sleep(400);
  const nb = await holmes.evaluate(() => { const e = document.querySelector(".notebook-sidebar"); if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), right: Math.round(window.innerWidth - r.right), tabs: e.querySelectorAll(".nb-tab").length }; });
  console.log("   sidebar:", JSON.stringify(nb));
  ok("notebook sidebar opens from RIGHT", nb && nb.right <= 1);
  ok("notebook sidebar width ≤ 320px", nb && nb.w <= 320);
  ok("notebook has its tabs", nb && nb.tabs === 3);
  await sleep(6000); // must NOT auto-close
  ok("notebook does NOT auto-close after 6s", await holmes.evaluate(() => !!document.querySelector(".notebook-sidebar")));
  await holmes.screenshot({ path: "ov-3-notebook.png" });
  await holmes.evaluate(() => document.querySelector(".notebook-sidebar .panel-x")?.click());
  await sleep(300);

  // ---- Menu ----
  console.log("\n[menu]");
  await holmes.evaluate(() => [...document.querySelectorAll(".hud-tool")].find(b => b.textContent.includes("☰")).click());
  await sleep(300);
  const menu = await holmes.evaluate(() => { const e = document.querySelector(".game-menu"); return e ? { items: [...e.querySelectorAll(".menu-item")].map(b => b.textContent.replace(/\s+/g, " ").trim()), help: e.querySelectorAll(".menu-help li").length } : null; });
  console.log("   menu:", JSON.stringify(menu));
  ok("menu has Sound toggle + Exit + 4-step help", menu && menu.items.some(t => /Sound/.test(t)) && menu.items.some(t => /Exit/.test(t)) && menu.help === 4);
  await holmes.screenshot({ path: "ov-4-menu.png" });
  await holmes.evaluate(() => document.querySelector(".panel-scrim")?.click());
  await sleep(300);

  // ---- New questions content ----
  console.log("\n[questions]");
  await holmes.evaluate(() => [...document.querySelectorAll(".act-btn")].find(b => /QUESTION/.test(b.textContent)).click());
  await holmes.waitForSelector(".suspect-card");
  await holmes.evaluate(() => document.querySelector(".suspect-card").click());
  await sleep(300);
  const qs = await holmes.evaluate(() => [...document.querySelectorAll(".ql-btn")].map(b => b.textContent.trim()));
  console.log("   first 3 questions:", JSON.stringify(qs.slice(0, 3)));
  ok("questions are the new character-driven set", qs.includes("What were you doing the moment the storm hit?") && qs.includes("Can anyone verify your alibi for the past hour?"));
  await holmes.screenshot({ path: "ov-5-questions.png" });
  await holmes.evaluate(() => document.querySelector(".modal-close")?.click());
  await sleep(300);

  // ---- Lock-in lockout ----
  console.log("\n[lock-in lockout]");
  // gather 2 clues: investigate study (we're here) then library
  await holmes.evaluate(() => [...document.querySelectorAll(".act-btn")][1].click()); await sleep(700);
  await enter(holmes, "library");
  await holmes.evaluate(() => [...document.querySelectorAll(".act-btn")][1].click()); await sleep(700);
  // accuse
  await holmes.evaluate(() => [...document.querySelectorAll(".act-btn")].find(b => /^ACCUSE/.test(b.textContent)).click());
  await holmes.waitForSelector(".accuse-modal");
  await holmes.evaluate(() => document.querySelector(".accuse-grid.suspects .pick-card").click());
  await holmes.evaluate(() => document.querySelectorAll(".accuse-section .accuse-grid:not(.suspects)")[0].querySelector(".pick-chip").click());
  await holmes.evaluate(() => document.querySelectorAll(".accuse-section .accuse-grid:not(.suspects)")[1].querySelector(".pick-chip").click());
  await holmes.evaluate(() => { const c = document.querySelectorAll(".accuse-clues .accuse-clue"); c[0].click(); c[1].click(); });
  await sleep(150);
  await holmes.evaluate(() => document.querySelector(".lock-in-btn").click());
  await holmes.waitForFunction(() => !document.querySelector(".accuse-modal"), { timeout: 8000 });
  await sleep(500);
  const locked = await holmes.evaluate(() => ({
    badge: !!document.querySelector(".hp-locked"),
    accuse: [...document.querySelectorAll(".act-btn")].find(b => b.textContent.includes("LOCKED IN"))?.textContent.trim(),
    labels: [...document.querySelectorAll(".act-btn")].map(b => b.textContent.trim()),
    allDisabled: [...document.querySelectorAll(".act-btn")].every(b => b.disabled),
  }));
  console.log("   after lock-in:", JSON.stringify(locked));
  ok("HUD shows LOCKED IN ✓ badge", locked.badge);
  ok("ACCUSE shows LOCKED IN ✓", /LOCKED IN/.test(locked.accuse || ""));
  ok("ALL action buttons disabled after lock-in", locked.allDisabled);
  // movement frozen
  const before = await pos(holmes);
  await holmes.keyboard.down("d"); await sleep(500); await holmes.keyboard.up("d"); await sleep(150);
  const after = await pos(holmes);
  ok("WASD movement frozen after lock-in", Math.hypot(after.x - before.x, after.y - before.y) < 2);
  await holmes.screenshot({ path: "ov-6-lockedin.png" });

  console.log("\n[console errors]:", errors.length ? errors.slice(0, 6).join(" | ") : "none");
  ok("no console/page errors", errors.length === 0);
  console.log(`\n=== ${fails === 0 ? "OVERHAUL: ALL PASSED ✓" : fails + " CHECK(S) FAILED ✗"} ===`);
} catch (e) {
  console.error("ERROR:", e.stack || e.message); console.log("recent errors:", errors.slice(-5).join(" | ")); fails++;
} finally {
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
}
