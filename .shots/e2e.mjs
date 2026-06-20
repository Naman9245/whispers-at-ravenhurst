// End-to-end playtest in two real Chrome tabs.
// Verifies (1) the player can ENTER ALL SIX rooms via WASD, and
//          (2) the LOCK IN ACCUSATION flow actually submits.
// Run the server with WHISPERS_FAST_TIMERS=demo (accuse gate open, long game).
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173";
const VW = 1600, VH = 900;

let fails = 0;
const ok = (label, cond) => { console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${label}`); if (!cond) fails++; };

async function clickByText(page, text) {
  const buttons = await page.$$("button");
  for (const h of buttons) {
    const t = await h.evaluate((b) => b.textContent.trim());
    if (t === text) { await h.click(); return true; }
  }
  console.log(`  ! button not found: "${text}"`);
  return false;
}

const roomText = (page) =>
  page.evaluate(() => document.querySelector(".hud-room-text")?.textContent?.trim() || "");

// Hold a key for ms (real keydown/keyup so the canvas input vector engages).
async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await sleep(ms);
  await page.keyboard.up(key);
  await sleep(120); // let a few rAF frames + region detection run
}

// Press a vertical key (w/s) to cross a doorway into targetLabel; if we don't
// make it (mis-aligned with the door), wiggle horizontally and retry.
async function enterRoom(page, vKey, targetLabel) {
  for (let i = 0; i < 16; i++) {
    // try crossing in short bursts
    for (let b = 0; b < 5; b++) {
      await hold(page, vKey, 260);
      if ((await roomText(page)).toUpperCase() === targetLabel) return true;
    }
    // not in — nudge along the corridor to hunt for the doorway gap
    const nudge = i % 2 === 0 ? "d" : "a";
    await hold(page, nudge, 220 + i * 70);
  }
  return false;
}

// Walk into the corridor from whichever room we're in (try down then up).
async function toCorridor(page) {
  for (const k of ["s", "w"]) {
    for (let b = 0; b < 6; b++) {
      await hold(page, k, 260);
      if ((await roomText(page)) === "In the corridor") return true;
    }
  }
  return (await roomText(page)) === "In the corridor";
}

// Slam to the left corridor wall for a consistent x reference, staying in corridor.
async function anchorLeft(page) {
  await hold(page, "a", 9000);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  protocolTimeout: 240000,
  defaultViewport: { width: VW, height: VH },
  args: [`--window-size=${VW},${VH}`],
});

try {
  // ---- lobby: Holmes creates, Watson joins -------------------------------
  const holmes = await browser.newPage();
  await holmes.goto(URL, { waitUntil: "networkidle2" });
  await holmes.waitForSelector(".lobby");
  await clickByText(holmes, "Create Room");
  await holmes.waitForSelector(".lobby-form");
  await clickByText(holmes, "Create");
  await holmes.waitForSelector(".lb-code-display");
  const code = await holmes.$eval(".lb-code-display", (el) => el.textContent.trim());
  console.log("room code:", code);

  const watson = await browser.newPage();
  await watson.setViewport({ width: VW, height: VH });
  await watson.goto(URL, { waitUntil: "networkidle2" });
  await watson.waitForSelector(".lobby");
  await clickByText(watson, "Join with Code");
  await watson.waitForSelector(".lb-input.code");
  await watson.type(".lb-input.code", code, { delay: 20 });
  await clickByText(watson, "Join");

  await Promise.all([
    holmes.waitForSelector(".board-canvas", { timeout: 15000 }),
    watson.waitForSelector(".board-canvas", { timeout: 15000 }),
  ]);
  await sleep(2500);
  console.log("\n[A] Both players in game. Holmes starts in:", await roomText(holmes));

  // focus the holmes page so keyboard goes there
  await holmes.bringToFront();
  await holmes.mouse.click(VW / 2, VH / 2); // also unlocks audio

  // ---- Bug #2: enter ALL SIX rooms via WASD ------------------------------
  console.log("\n[B] Movement — enter every room from the corridor (WASD):");
  ok("start room is STUDY", (await roomText(holmes)).toUpperCase() === "STUDY");

  const results = {};
  // study(0,0) dining(1,0) lounge(2,0) / library(0,1) kitchen(1,1) conservatory(2,1)
  // approx hold-right (ms) from left wall to each column center @160px/s:
  //  col0 ~1100ms, col1 ~4225ms, col2 ~7350ms
  const tour = [
    { label: "LIBRARY",      col: 1100, vKey: "s" },
    { label: "DINING HALL",  col: 4225, vKey: "w" },
    { label: "KITCHEN",      col: 4225, vKey: "s" },
    { label: "LOUNGE",       col: 7350, vKey: "w" },
    { label: "CONSERVATORY", col: 7350, vKey: "s" },
  ];

  // STUDY already confirmed (start). Investigate it for clues (for Bug #1 later).
  await holmes.evaluate(() => document.querySelectorAll(".action-bar button")[1]?.click());
  await sleep(900);

  for (const t of tour) {
    await toCorridor(holmes);
    await anchorLeft(holmes);
    await hold(holmes, "d", t.col);
    const got = await enterRoom(holmes, t.vKey, t.label);
    results[t.label] = got;
    ok(`enter ${t.label}`, got);
    if (got) {
      // investigate here too (accumulate evidence for the accusation test)
      await holmes.evaluate(() => document.querySelectorAll(".action-bar button")[1]?.click());
      await sleep(700);
    }
  }
  results["STUDY"] = true;
  await holmes.screenshot({ path: "e2e-after-tour.png" });

  // ---- Bug #1: LOCK IN ACCUSATION submits --------------------------------
  console.log("\n[C] Accusation — open modal, fill it, LOCK IN:");
  const ev = await holmes.evaluate(() => document.querySelector(".nb-evidence-head")?.textContent || "EVIDENCE (0)");
  console.log("   evidence gathered:", ev);

  // Click ACCUSE (4th action button, index 3)
  await holmes.evaluate(() => document.querySelectorAll(".action-bar button")[3]?.click());
  const modalOpen = await holmes.waitForSelector(".accuse-modal", { timeout: 5000 }).then(() => true).catch(() => false);
  ok("ACCUSE opens the accusation modal", modalOpen);

  if (modalOpen) {
    // pick first culprit, first weapon, first room
    await holmes.evaluate(() => document.querySelector(".accuse-grid.suspects .pick-card")?.click());
    await sleep(120);
    await holmes.evaluate(() => {
      const chips = document.querySelectorAll(".accuse-section .accuse-grid:not(.suspects) .pick-chip");
      // weapons grid is the first non-suspect grid, rooms the second
      chips[0]?.click();
    });
    await sleep(120);
    await holmes.evaluate(() => {
      const grids = [...document.querySelectorAll(".accuse-section .accuse-grid:not(.suspects)")];
      grids[1]?.querySelector(".pick-chip")?.click(); // room
    });
    await sleep(120);
    // pick 2 supporting clues
    await holmes.evaluate(() => {
      const clues = document.querySelectorAll(".accuse-clues .accuse-clue");
      clues[0]?.click(); clues[1]?.click();
    });
    await sleep(200);
    await holmes.screenshot({ path: "e2e-accuse-filled.png" });

    // read the lock-in button state, then click it
    const btnText = await holmes.evaluate(() => document.querySelector(".lock-in-btn")?.textContent?.trim());
    console.log("   lock-in button says:", btnText);
    await holmes.evaluate(() => document.querySelector(".lock-in-btn")?.click());

    // success == modal closes AND a 'locked' toast / LOCKED IN action label appears
    const closed = await holmes.waitForFunction(
      () => !document.querySelector(".accuse-modal"),
      { timeout: 8000 }
    ).then(() => true).catch(() => false);
    ok("modal closes after LOCK IN (submission accepted)", closed);

    await sleep(500);
    const toast = await holmes.evaluate(() => document.querySelector(".toast")?.textContent?.trim() || "");
    const accuseBtn = await holmes.evaluate(() =>
      [...document.querySelectorAll(".action-bar button")].map((b) => b.textContent.trim()));
    console.log("   toast:", JSON.stringify(toast));
    console.log("   action buttons now:", JSON.stringify(accuseBtn));
    ok("shows 'waiting for opponent' confirmation", /waiting|locked/i.test(toast) || accuseBtn.includes("LOCKED IN"));
    await holmes.screenshot({ path: "e2e-after-lockin.png" });

    // Watson should see the opponent-locked banner (final window)
    await sleep(800);
    const wBanner = await watson.evaluate(() => document.querySelector(".window-banner")?.textContent || "");
    console.log("   Watson banner:", JSON.stringify(wBanner));
    ok("Watson sees opponent-locked notice", /locked in/i.test(wBanner));
  }

  console.log(`\n=== ${fails === 0 ? "ALL E2E CHECKS PASSED ✓" : fails + " E2E CHECK(S) FAILED ✗"} ===`);
} catch (e) {
  console.error("ERROR:", e.stack || e.message);
  fails++;
} finally {
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
}
