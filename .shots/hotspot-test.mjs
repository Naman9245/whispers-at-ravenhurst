// Phase 2.2 e2e: hotspot examination via walk-up + E and proximity-click.
// Needs the client (:5173) and a demo-timer server (:3001) running.
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173";
const VW = 1600, VH = 900;
const BOARD_W = 1472, BOARD_H = 860;
let fails = 0;
const ok = (l, c) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${l}`); if (!c) fails++; };
const clickByText = async (p, t) => { for (const h of await p.$$("button")) if ((await h.evaluate(b => b.textContent.trim())) === t) { await h.click(); return true; } return false; };
const pos = (p) => p.evaluate(() => ({ x: window.__wrChar.x, y: window.__wrChar.y, room: window.__wrChar.anchorRoom }));

// Study hotspot pixel positions (roomRect study = x44 y120 w384 h252).
const SPOT = {
  study_desk:      [44 + 0.50 * 384, 120 + 0.50 * 252],
  study_bookshelf: [44 + 0.20 * 384, 120 + 0.20 * 252],
  study_fireplace: [44 + 0.82 * 384, 120 + 0.80 * 252],
  study_armchair:  [44 + 0.50 * 384, 120 + 0.74 * 252],
};

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
const pressE = async (page) => { await page.keyboard.down("e"); await sleep(130); await page.keyboard.up("e"); await sleep(250); };
const modalText = (page) => page.evaluate(() => {
  const m = document.querySelector(".examine-modal"); if (!m) return null;
  return { title: m.querySelector(".examine-title")?.textContent || "", clue: m.querySelector(".examine-clue-text")?.textContent || "", empty: !!m.querySelector(".examine-empty") };
});
const closeModal = async (page) => { await page.evaluate(() => document.querySelector(".examine-ok")?.click()); await sleep(150); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 180000, defaultViewport: { width: VW, height: VH }, args: [`--window-size=${VW},${VH}`] });
const errors = [];
try {
  const holmes = await browser.newPage();
  holmes.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  holmes.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });
  await holmes.goto(URL, { waitUntil: "networkidle2" });
  await holmes.waitForSelector(".lobby"); await clickByText(holmes, "Create Room");
  await holmes.waitForSelector(".lobby-form"); await holmes.click('.lb-check input[type="checkbox"]'); await clickByText(holmes, "Create");
  await holmes.waitForSelector(".lb-code-display");
  const code = await holmes.$eval(".lb-code-display", e => e.textContent.trim());
  const watson = await browser.newPage(); await watson.setViewport({ width: VW, height: VH });
  await watson.goto(URL, { waitUntil: "networkidle2" });
  await watson.waitForSelector(".lobby"); await clickByText(watson, "Join with Code");
  await watson.waitForSelector(".lb-input.code"); await watson.type(".lb-input.code", code, { delay: 20 }); await clickByText(watson, "Join");
  await holmes.waitForSelector(".board-canvas"); await sleep(2000);
  await holmes.bringToFront(); await holmes.mouse.click(VW / 2, VH / 2);

  console.log("\n[1] Indicators render; screenshot the Study with its 4 hotspots.");
  ok("start room is STUDY", (await pos(holmes)).room === "study");
  await holmes.screenshot({ path: "hs-1-indicators.png" });

  console.log("\n[2] Walk to The Desk + press E → clue (shared-3).");
  await moveTo(holmes, ...SPOT.study_desk);
  await pressE(holmes);
  const m1 = await modalText(holmes);
  ok("examine modal opened with a clue", !!m1 && m1.title.includes("The Desk") && m1.clue.length > 0);
  console.log("   clue:", JSON.stringify((m1?.clue || "").slice(0, 60)));
  await holmes.screenshot({ path: "hs-2-examine-clue.png" });
  await closeModal(holmes);

  console.log("\n[3] Re-examining the same spot does nothing (no modal).");
  await pressE(holmes); // desk now examined → excluded from active
  ok("no modal on re-examine of an examined spot", (await modalText(holmes)) === null);

  console.log("\n[4] The Armchair → second clue (p1-4).");
  await moveTo(holmes, ...SPOT.study_armchair);
  await pressE(holmes);
  const m2 = await modalText(holmes);
  ok("armchair yields a clue", !!m2 && m2.title.includes("The Armchair") && m2.clue.length > 0);
  await closeModal(holmes);

  console.log("\n[5] The Bookshelf → flavor (empty), reached + examinable.");
  await moveTo(holmes, ...SPOT.study_bookshelf);
  await pressE(holmes);
  const m3 = await modalText(holmes);
  ok("bookshelf reachable + examined → 'nothing of interest'", !!m3 && m3.title.includes("The Bookshelf") && m3.empty === true);
  await closeModal(holmes);

  console.log("\n[6] The Fireplace via mouse CLICK (proximity-gated) → examined.");
  await moveTo(holmes, ...SPOT.study_fireplace);
  await sleep(150);
  const rect = await holmes.evaluate(() => { const c = document.querySelector(".board-canvas"); const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height }; });
  const sx = rect.left + SPOT.study_fireplace[0] * (rect.w / BOARD_W);
  const sy = rect.top + SPOT.study_fireplace[1] * (rect.h / BOARD_H);
  await holmes.mouse.click(sx, sy);
  await sleep(300);
  const m4 = await modalText(holmes);
  ok("click examined the fireplace (all 4 study hotspots reachable)", !!m4 && m4.title.includes("The Fireplace"));
  await closeModal(holmes);

  console.log("\n[7] Progress + notebook reflect the 2 real clues with hotspot names.");
  const count = await holmes.evaluate(() => [...document.querySelectorAll(".ct-count")].map(e => e.textContent.trim()));
  console.log("   clue tracker:", JSON.stringify(count));
  ok("Holmes shows 2/7 (shared-3 + p1-4; herrings/flavor excluded)", count.some(t => t === "2/7"));
  await holmes.evaluate(() => [...document.querySelectorAll(".hud-tool")].find(b => /Notebook/.test(b.textContent)).click());
  await sleep(300);
  const nb = await holmes.evaluate(() => ({
    rooms: [...document.querySelectorAll(".nb-clue-room")].map(e => e.textContent.replace(/\s+/g, " ").trim()),
  }));
  console.log("   evidence rooms/hotspots:", JSON.stringify(nb.rooms));
  ok("evidence shows hotspot names (Desk + Armchair)", nb.rooms.some(t => /The Desk/.test(t)) && nb.rooms.some(t => /The Armchair/.test(t)));
  // rooms tab → study searched 4/4
  await holmes.evaluate(() => [...document.querySelectorAll(".notebook-tabs button")].find(b => /ROOMS/.test(b.textContent)).click());
  await sleep(250);
  const studySearched = await holmes.evaluate(() => {
    const row = [...document.querySelectorAll(".nb-row.room")].find(r => /STUDY/.test(r.textContent));
    return row ? row.textContent.replace(/\s+/g, " ").trim() : "";
  });
  console.log("   study row:", JSON.stringify(studySearched));
  ok("Study shows ✓ Searched (all 4 examined)", /Searched/.test(studySearched));
  await holmes.screenshot({ path: "hs-3-notebook.png" });

  console.log("\n[8] Privacy: Watson saw only an ambient 'examining' note, no hotspot/clue.");
  await watson.bringToFront();
  await watson.evaluate(() => [...document.querySelectorAll(".hud-tool")].find(b => /Activity/.test(b.textContent)).click());
  await sleep(300);
  const wActivity = await watson.evaluate(() => [...document.querySelectorAll(".activity-line")].map(l => l.textContent).join(" | "));
  console.log("   Watson activity:", JSON.stringify(wActivity));
  ok("Watson sees 'examining something', never a hotspot/clue", /examining/i.test(wActivity) && !/The Desk|The Armchair|lamp|dust/i.test(wActivity));

  console.log("\n[errors]:", errors.length ? errors.slice(0, 5).join(" | ") : "none");
  ok("no console/page errors", errors.length === 0);
  console.log(`\n=== ${fails === 0 ? "HOTSPOT E2E: ALL PASSED ✓" : fails + " FAILED ✗"} ===`);
} catch (e) {
  console.error("ERROR:", e.stack || e.message); console.log("recent errors:", errors.slice(-5).join(" | ")); fails++;
} finally {
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
}
