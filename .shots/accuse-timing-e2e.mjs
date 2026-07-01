// Real 2-tab browser coverage for the two ACCUSE-driven endgame paths, alongside
// the no-accuse path in timer-expiry-test.mjs. Together they cover all three
// critical accusation-timing scenarios end-to-end (client + server):
//
//   S1 (timer-expiry-test.mjs) — nobody accuses → soft cap → double-forfeit reveal.
//   S8 (here) — one accuses, the other doesn't → the opponent WINDOW closes →
//               auto-forfeit for the non-accuser, submitter wins.
//   S9 (here) — BOTH accuse before the timer → reveal fires IMMEDIATELY on the
//               second lock-in, without waiting out any timer.
//
// Runs against the client (:5173) + a normal Dev-Mode server (:3001) — Dev Mode
// timers are 60s soft cap / 20s accuse gate / 30s opponent window. Reduced-motion
// is emulated so examinations skip the 2.5s search and stay fast/stable.
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173";
const VW = 1600, VH = 900;
let fails = 0;
const ok = (l, c) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${l}`); if (!c) fails++; };
const clickByText = async (p, t) => { for (const h of await p.$$("button")) if ((await h.evaluate((b) => b.textContent.trim())) === t) { await h.click(); return true; } return false; };
const pos = (p) => p.evaluate(() => ({ x: window.__wrChar.x, y: window.__wrChar.y, room: window.__wrChar.anchorRoom }));

// Board geometry (from shared/mapData.js): study x44/y120, dining x544/y120, each
// 384x252; corridor Y=430. Hotspot fractions from shared/roomHotspots.js.
const P = {
  study_desk:     [44 + 0.50 * 384, 120 + 0.50 * 252],   // shared-3 (both players)
  study_armchair: [44 + 0.50 * 384, 120 + 0.74 * 252],   // p1-4 (Holmes only)
  dining_table:   [544 + 0.50 * 384, 120 + 0.50 * 252],  // shared-1 (both players)
};
const CORRIDOR_Y = 430;

async function moveTo(page, tx, ty, tol = 10, max = 220) {
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
const closeModal = async (page) => { await page.evaluate(() => document.querySelector(".examine-ok")?.click()); await sleep(150); };
const clueCount = (page) => page.evaluate(() => {
  const t = [...document.querySelectorAll(".ct-count")].map((e) => e.textContent.trim()).find((x) => /^\d+\/\d+$/.test(x));
  return t ? Number(t.split("/")[0]) : -1;
});

// Two fresh tabs → a fresh Dev-Mode room. Both emulate reduced-motion. Players use
// the default names (Holmes / Watson); on each tab its own card is marked "(you)".
async function freshGame(browser) {
  const holmes = await browser.newPage();
  const watson = await browser.newPage();
  for (const p of [holmes, watson]) {
    await p.setViewport({ width: VW, height: VH });
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  }
  await holmes.bringToFront();
  await holmes.goto(URL, { waitUntil: "networkidle2" });
  await holmes.waitForSelector(".lobby"); await clickByText(holmes, "Create Room");
  await holmes.waitForSelector(".lobby-form"); await holmes.click('.lb-check input[type="checkbox"]'); await clickByText(holmes, "Create");
  await holmes.waitForSelector(".lb-code-display");
  const code = await holmes.$eval(".lb-code-display", (e) => e.textContent.trim());

  await watson.bringToFront();
  await watson.goto(URL, { waitUntil: "networkidle2" });
  await watson.waitForSelector(".lobby"); await clickByText(watson, "Join with Code");
  await watson.waitForSelector(".lb-input.code"); await watson.type(".lb-input.code", code, { delay: 20 }); await clickByText(watson, "Join");

  for (const p of [holmes, watson]) {
    await p.bringToFront();
    await p.waitForSelector(".board-canvas", { timeout: 15000 });
    await p.waitForFunction(() => !!window.__wrChar, { timeout: 10000 });
  }
  return { holmes, watson };
}

// Examine a hotspot the character is standing near (must already be adjacent).
async function examineAt(page, xy) { await moveTo(page, ...xy); await pressE(page); await closeModal(page); }

// Poll until the ACCUSE button leaves its gated "OPENS" state (Dev gate = 20s).
async function waitAccuseGate(page, maxMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const b = await page.evaluate(() => {
      const btn = [...document.querySelectorAll(".action-bar button")].find((x) => /ACCUSE|OPENS|LOCKED/.test(x.textContent));
      return btn ? { text: btn.textContent.trim(), disabled: btn.disabled } : null;
    });
    if (b && /^ACCUSE/.test(b.text) && !b.disabled) return true;
    await sleep(1000);
  }
  return false;
}

// Open the accusation modal, fill it validly (first suspect/weapon/room + 2 found
// clues) and lock in. Correctness doesn't matter here — only that a valid lock-in
// is accepted, which drives the timing paths under test.
async function lockIn(page) {
  await page.bringToFront();
  await page.evaluate(() => [...document.querySelectorAll(".action-bar button")].find((b) => /^ACCUSE/.test(b.textContent)).click());
  await page.waitForSelector(".accuse-modal", { timeout: 5000 });
  await page.evaluate(() => document.querySelector(".accuse-grid.suspects .pick-card").click());
  await page.evaluate(() => document.querySelectorAll(".accuse-section .accuse-grid:not(.suspects)")[0].querySelector(".pick-chip").click());
  await page.evaluate(() => document.querySelectorAll(".accuse-section .accuse-grid:not(.suspects)")[1].querySelector(".pick-chip").click());
  await page.evaluate(() => { const c = document.querySelectorAll(".accuse-clues .accuse-clue"); c[0].click(); if (c[1]) c[1].click(); });
  await sleep(150);
  await page.evaluate(() => document.querySelector(".lock-in-btn").click());
  await page.waitForFunction(() => !document.querySelector(".accuse-modal"), { timeout: 8000 });
}

const revealCards = (page) => page.evaluate(() =>
  [...document.querySelectorAll(".reveal-card")].map((c) => ({
    head: c.querySelector(".rc-head")?.textContent || "",
    forfeit: !!c.querySelector(".rc-forfeit"),
    winner: c.classList.contains("winner"),
  }))
);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new", protocolTimeout: 180000,
  defaultViewport: { width: VW, height: VH }, args: [`--window-size=${VW},${VH}`],
});
try {
  // ===== Scenario 8: one accuses, the other doesn't → window auto-forfeit =====
  console.log("\n[S8] One accuses, opponent goes silent → the 30s window closes → auto-forfeit.");
  {
    const { holmes, watson } = await freshGame(browser);
    await holmes.bringToFront();
    await examineAt(holmes, P.study_desk);      // shared-3
    await examineAt(holmes, P.study_armchair);  // p1-4  → Holmes now holds 2 clues
    ok("[S8] Holmes gathered 2 clues", (await clueCount(holmes)) === 2);

    ok("[S8] accuse gate opens (Dev 20s)", await waitAccuseGate(holmes));
    const revealAtH = holmes.waitForSelector(".reveal-screen", { timeout: 50000 }).then(() => Date.now());
    const revealAtW = watson.waitForSelector(".reveal-screen", { timeout: 50000 }).then(() => Date.now());

    await lockIn(holmes);                        // Holmes locks → 30s opponent window starts
    const tLock = Date.now();
    console.log("   Holmes locked in; Watson stays silent — waiting out the 30s window…");
    // Watson does NOTHING. Reveal must come from the window closing, not immediately.
    const [rH] = await Promise.all([revealAtH, revealAtW]);
    const waited = (rH - tLock) / 1000;
    console.log(`   reveal fired ~${waited.toFixed(1)}s after Holmes locked`);
    ok("[S8] reveal waited for the window (~30s), not immediate", waited > 15);

    const cards = await revealCards(holmes);          // on Holmes's tab, his card is "(you)"
    const mine = cards.find((c) => /\(you\)/.test(c.head));   // the accuser (Holmes)
    const opp = cards.find((c) => !/\(you\)/.test(c.head));   // the silent opponent (Watson)
    ok("[S8] exactly one player forfeited", cards.filter((c) => c.forfeit).length === 1);
    ok("[S8] the NON-accuser (opponent) is the one who forfeited", !!opp && opp.forfeit === true);
    ok("[S8] the accuser did NOT forfeit", !!mine && mine.forfeit === false);
    ok("[S8] the accuser is the winner", !!mine && mine.winner === true);
    await holmes.bringToFront();
    await holmes.screenshot({ path: ".shots/accuse-s8-window-forfeit.png" });
    await holmes.close(); await watson.close();
  }

  // ===== Scenario 9: both accuse before the timer → immediate reveal =====
  console.log("\n[S9] Both accuse → reveal fires immediately on the 2nd lock (no waiting).");
  {
    const { holmes, watson } = await freshGame(browser);
    await holmes.bringToFront();
    await examineAt(holmes, P.study_desk);      // shared-3
    await examineAt(holmes, P.study_armchair);  // p1-4 → 2 clues
    ok("[S9] Holmes gathered 2 clues", (await clueCount(holmes)) === 2);

    // Watson: shared-3 in the study, then walk study → corridor → dining for shared-1.
    await watson.bringToFront();
    await examineAt(watson, P.study_desk);       // shared-3
    await moveTo(watson, 236, CORRIDOR_Y);       // down into the corridor
    await moveTo(watson, 736, CORRIDOR_Y);       // along to under the dining door
    await examineAt(watson, P.dining_table);     // shared-1 → Watson now holds 2 clues
    ok("[S9] Watson gathered 2 clues (incl. a trip to the dining hall)", (await clueCount(watson)) === 2);

    ok("[S9] accuse gate opens for both", await waitAccuseGate(holmes));
    const revealAtH = holmes.waitForSelector(".reveal-screen", { timeout: 20000 }).then(() => Date.now());
    const revealAtW = watson.waitForSelector(".reveal-screen", { timeout: 20000 }).then(() => Date.now());

    await lockIn(holmes);                         // 1st lock → starts a 30s window
    const tHolmesLock = Date.now();
    await lockIn(watson);                          // 2nd lock → should resolve IMMEDIATELY
    const [rH] = await Promise.all([revealAtH, revealAtW]);
    const sinceFirst = (rH - tHolmesLock) / 1000;
    console.log(`   reveal fired ~${sinceFirst.toFixed(1)}s after the FIRST lock (window is 30s)`);
    ok("[S9] reveal was immediate on 2nd lock, NOT the 30s window / 60s cap", sinceFirst < 15);

    const cards = await revealCards(holmes);
    ok("[S9] both tabs reached the reveal", (await watson.$(".reveal-screen")) !== null);
    ok("[S9] neither player forfeited (both accused)", cards.filter((c) => c.forfeit).length === 0);
    ok("[S9] both cards show a submitted accusation", (await holmes.evaluate(() => document.querySelectorAll(".rc-accusation").length)) === 2);
    await holmes.bringToFront();
    await holmes.screenshot({ path: ".shots/accuse-s9-immediate.png" });
    await holmes.close(); await watson.close();
  }

  console.log(`\n=== ${fails === 0 ? "ACCUSE-TIMING E2E: ALL PASSED ✓" : fails + " FAILED ✗"} ===`);
} catch (e) {
  console.error("ERROR:", e.stack || e.message); fails++;
} finally {
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
}
