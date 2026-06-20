// Deterministic movement test: closed-loop navigation (reads the dev-only
// window.__wrChar position) to prove the player can ENTER ALL SIX rooms via
// WASD through the corridor + doorways. Also measures the board size.
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173";
const VW = 1600, VH = 900;

let fails = 0;
const ok = (label, cond) => { console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${label}`); if (!cond) fails++; };

async function clickByText(page, text) {
  for (const h of await page.$$("button")) {
    if ((await h.evaluate((b) => b.textContent.trim())) === text) { await h.click(); return true; }
  }
  return false;
}
const roomText = (p) => p.evaluate(() => document.querySelector(".hud-room-text")?.textContent?.trim() || "");
const pos = (p) => p.evaluate(() => window.__wrChar ? { x: window.__wrChar.x, y: window.__wrChar.y, room: window.__wrChar.anchorRoom, cor: window.__wrChar.inCorridor } : null);

// Geometry (mirrors shared/mapData.js)
const COLX = { 0: 236, 1: 736, 2: 1236 };
const ROWY = { 0: 246, 1: 614 };
const CORY = 430;
const CELL = {
  study: [0, 0], dining: [1, 0], lounge: [2, 0],
  library: [0, 1], kitchen: [1, 1], conservatory: [2, 1],
};

// Closed-loop: press toward (tx,ty) in short bursts until within tol or stuck.
async function moveTo(page, tx, ty, tol = 10, maxIters = 300) {
  let stuck = 0, prev = null;
  for (let i = 0; i < maxIters; i++) {
    const p = await pos(page);
    if (!p) return false;
    const dx = tx - p.x, dy = ty - p.y;
    if (Math.hypot(dx, dy) < tol) return true;
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1.5) { if (++stuck > 8) return false; } else stuck = 0;
    prev = p;
    const keys = [];
    if (Math.abs(dx) > tol) keys.push(dx > 0 ? "d" : "a");
    if (Math.abs(dy) > tol) keys.push(dy > 0 ? "s" : "w");
    for (const k of keys) await page.keyboard.down(k);
    await sleep(70);
    for (const k of keys) await page.keyboard.up(k);
    await sleep(15);
  }
  return false;
}

// Route into a room: room→corridor (vertical through own door) → target column
// (horizontal in corridor) → into target room (vertical through its door).
async function go(page, target) {
  const [tc, tr] = CELL[target];
  const cur = await pos(page);
  const curCol = cur.room ? CELL[cur.room][0] : tc;
  // 1) to corridor at current column
  await moveTo(page, COLX[curCol], CORY, 14);
  // 2) along corridor to the target column
  await moveTo(page, COLX[tc], CORY, 14);
  // 3) into the target room centre
  await moveTo(page, COLX[tc], ROWY[tr], 16);
  return (await roomText(page)).toUpperCase() === target.toUpperCase().replace("DINING", "DINING HALL").replace("DINING HALL HALL", "DINING HALL");
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new", protocolTimeout: 240000,
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
  await sleep(2500);
  await holmes.bringToFront();
  await holmes.mouse.click(VW / 2, VH / 2);

  // Board size measurement (Issue #3)
  const board = await holmes.evaluate(() => {
    const c = document.querySelector(".board-canvas"); const r = c.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), vw: window.innerWidth, vh: window.innerHeight };
  });
  console.log(`\n[board] canvas ${board.w}x${board.h}px  → ${(board.w / board.vw * 100).toFixed(1)}% of ${board.vw}px viewport width`);

  console.log("\n[movement] enter every room via WASD (closed-loop):");
  const order = ["library", "kitchen", "conservatory", "lounge", "dining", "study"];
  ok("start room is STUDY", (await roomText(holmes)).toUpperCase() === "STUDY");
  for (const target of order) {
    const want = target === "dining" ? "DINING HALL" : target.toUpperCase();
    const [tc, tr] = CELL[target];
    const cur = await pos(holmes);
    const curCol = cur.room ? CELL[cur.room][0] : tc;
    await moveTo(holmes, COLX[curCol], CORY, 14);
    await moveTo(holmes, COLX[tc], CORY, 14);
    await moveTo(holmes, COLX[tc], ROWY[tr], 16);
    const got = (await roomText(holmes)).toUpperCase() === want;
    ok(`enter ${want}`, got);
    if (!got) console.log("     stuck at", JSON.stringify(await pos(holmes)));
  }

  console.log(`\n=== ${fails === 0 ? "ALL MOVEMENT CHECKS PASSED ✓" : fails + " MOVEMENT CHECK(S) FAILED ✗"} ===`);
} catch (e) {
  console.error("ERROR:", e.stack || e.message); fails++;
} finally {
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
}
