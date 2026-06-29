// Phase 2.4a e2e: verify critical sound wiring (footsteps, searching, clue/nothing,
// tick burst, mute). Headless Chrome has no speakers, so we assert on the sound
// manager's observable state via window.__wrAudio.state() — per-sound play counts,
// the footstep state machine, and each element's paused flag — rather than "hearing".
// Needs client (:5173) + server (:3001) running. Uses DEV MODE (60s) so the
// final-minute tick burst fires at game start.
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173", VW = 1600, VH = 900;
let fails = 0;
const ok = (l, c) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${l}`); if (!c) fails++; };
const clickByText = async (p, t) => { for (const h of await p.$$("button")) if ((await h.evaluate(b => b.textContent.trim())) === t) { await h.click(); return true; } return false; };
const pos = (p) => p.evaluate(() => ({ x: window.__wrChar.x, y: window.__wrChar.y, room: window.__wrChar.anchorRoom }));
const aud = (p) => p.evaluate(() => (window.__wrAudio ? window.__wrAudio.state() : null));
const hasModal = (p) => p.evaluate(() => !!document.querySelector(".examine-modal"));
const modalType = (p) => p.evaluate(() => {
  const m = document.querySelector(".examine-modal"); if (!m) return null;
  return m.querySelector(".examine-clue-text") ? "clue" : (m.querySelector(".examine-empty") ? "empty" : "other");
});
const down = async (p, keys) => { for (const k of keys) await p.keyboard.down(k); };
const up = async (p, keys) => { for (const k of keys) await p.keyboard.up(k); };

// Study hotspot pixel positions (roomRect study = x44 y120 w384 h252).
const SPOT = {
  study_desk:      [44 + 0.50 * 384, 120 + 0.50 * 252],
  study_bookshelf: [44 + 0.20 * 384, 120 + 0.20 * 252],
  study_armchair:  [44 + 0.50 * 384, 120 + 0.74 * 252],
  study_fireplace: [44 + 0.82 * 384, 120 + 0.80 * 252],
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
const pressE = async (page) => { await page.keyboard.down("e"); await sleep(120); await page.keyboard.up("e"); };
async function waitModal(page, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await hasModal(page)) return Date.now() - start; await sleep(40); }
  return -1;
}
// Examine a hotspot and assert the searching loop ran + the matching result sfx fired.
async function examineAndCheck(page, spot, name) {
  const b = await aud(page);
  await moveTo(page, ...SPOT[spot]);
  await pressE(page);
  await sleep(350);
  const mid = await aud(page);
  ok(`${name}: searching loop plays during the 2.5s`, mid.playing.searching === true && (mid.plays.searching || 0) > (b.plays.searching || 0));
  ok(`${name}: cannot move while searching (input locked)`, mid.footState === "idle");
  await waitModal(page);
  const type = await modalType(page);
  const after = await aud(page);
  ok(`${name}: searching loop stopped when the modal opened`, after.playing.searching === false);
  if (type === "clue") {
    ok(`${name}: clue modal → clue-found ding fired`, (after.plays.clueFound || 0) > (b.plays.clueFound || 0));
  } else if (type === "empty") {
    ok(`${name}: empty modal → nothing-found whoosh fired`, (after.plays.nothingFound || 0) > (b.plays.nothingFound || 0));
  } else {
    ok(`${name}: modal had a known type`, false);
  }
  await page.keyboard.press("Enter"); await sleep(200);
  return type;
}

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
  await h.waitForSelector(".lobby"); await clickByText(h, "Create Room");
  await h.waitForSelector(".lobby-form"); await h.click('.lb-check input[type="checkbox"]'); await clickByText(h, "Create"); // DEV MODE
  await h.waitForSelector(".lb-code-display");
  const code = await h.$eval(".lb-code-display", e => e.textContent.trim());
  const w = await browser.newPage(); await w.setViewport({ width: VW, height: VH });
  await w.goto(URL, { waitUntil: "networkidle2" });
  await w.waitForSelector(".lobby"); await clickByText(w, "Join with Code");
  await w.waitForSelector(".lb-input.code"); await w.type(".lb-input.code", code, { delay: 20 }); await clickByText(w, "Join");
  await h.waitForSelector(".board-canvas"); await sleep(1500);
  await h.bringToFront(); await h.mouse.click(VW / 2, VH / 2); // ensure audio unlocked
  await h.waitForFunction(() => !!window.__wrAudio);

  console.log("\n[0] Audio manager loaded + unlocked on first gesture.");
  let s = await aud(h);
  ok("window.__wrAudio handle present", !!s);
  ok("audio unlocked after the first click", s.unlocked === true);
  ok("starts un-muted (default sound ON)", s.muted === false);

  console.log("\n[1] TICK BURST: fires once at the 1:00 mark (dev-mode urgent from start).");
  await h.waitForFunction(() => window.__wrAudio.state().plays.tickBurst >= 1, { timeout: 5000 }).catch(() => {});
  s = await aud(h);
  ok("tick burst fired (plays.tickBurst >= 1)", (s.plays.tickBurst || 0) >= 1);
  ok("tick burst fired exactly once (no loop/stack)", (s.plays.tickBurst || 0) === 1);
  ok("final-minute urgency vignette present", (await h.$(".vignette-edges")) !== null);

  console.log("\n[2] FOOTSTEPS: idle→walk→sprint→walk→idle transitions.");
  // Park on the left side of the study so the eastward walk/sprint run has a full
  // room-width of clearance and never reaches the east wall — running into a wall
  // now correctly silences footsteps (see bugfix-test), which isn't what [2] tests.
  await h.evaluate(() => { window.__wrChar.x = 110; window.__wrChar.y = 246; });
  await sleep(60);
  await down(h, ["d"]); await sleep(250);
  s = await aud(h);
  ok("walk: footstepsWalk loop playing", s.footState === "walk" && s.playing.footstepsWalk === true && (s.plays.footstepsWalk || 0) >= 1);
  await down(h, ["Shift"]); await sleep(250);
  s = await aud(h);
  ok("sprint: switches to sprint (walk stops, sprint plays)", s.footState === "sprint" && s.playing.footstepsSprint === true && s.playing.footstepsWalk === false && (s.plays.footstepsSprint || 0) >= 1);
  await up(h, ["Shift"]); await sleep(250);
  s = await aud(h);
  ok("release sprint (still moving): back to walk", s.footState === "walk" && s.playing.footstepsWalk === true && s.playing.footstepsSprint === false);
  const walkPlaysAfterSeq = s.plays.footstepsWalk || 0;
  await up(h, ["d"]); await sleep(250);
  s = await aud(h);
  ok("idle: footsteps stop (silence)", s.footState === "idle" && s.playing.footstepsWalk === false && s.playing.footstepsSprint === false);
  ok("no stacking: walk started only on transitions (<= 3 over the sequence)", walkPlaysAfterSeq <= 3);

  console.log("\n[3] EXAMINATION: searching loop + clue-found / nothing-found.");
  const t1 = await examineAndCheck(h, "study_desk", "Desk");
  const t2 = await examineAndCheck(h, "study_bookshelf", "Bookshelf");
  // Cover whichever result type we haven't seen yet, so both dings are exercised.
  let seen = new Set([t1, t2]);
  if (!seen.has("clue") || !seen.has("empty")) {
    const t3 = await examineAndCheck(h, "study_armchair", "Armchair");
    seen.add(t3);
    if (!seen.has("clue") || !seen.has("empty")) { const t4 = await examineAndCheck(h, "study_fireplace", "Fireplace"); seen.add(t4); }
  }
  s = await aud(h);
  ok("clue-found ding exercised at least once", (s.plays.clueFound || 0) >= 1);
  ok("nothing-found whoosh exercised at least once", (s.plays.nothingFound || 0) >= 1);

  console.log("\n[4] MUTE: stops currently-playing audio + suppresses new; unmute resumes.");
  await down(h, ["d"]); await sleep(250);
  s = await aud(h);
  ok("pre-mute: footsteps playing", s.playing.footstepsWalk === true);
  await h.evaluate(() => [...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === "Menu")?.click());
  await sleep(150);
  await h.evaluate(() => [...document.querySelectorAll(".menu-item")].find(b => /Sound/.test(b.textContent))?.click()); // → OFF
  await sleep(200);
  s = await aud(h);
  ok("mute OFF immediately stops currently-playing footsteps", s.muted === true && s.playing.footstepsWalk === false);
  const mutedWalkPlays = s.plays.footstepsWalk || 0;
  await sleep(350); // still holding d, but muted
  s = await aud(h);
  ok("muted: moving produces no new footsteps", s.footState === "idle" && (s.plays.footstepsWalk || 0) === mutedWalkPlays);
  await up(h, ["d"]);
  await h.evaluate(() => [...document.querySelectorAll(".menu-item")].find(b => /Sound/.test(b.textContent))?.click()); // → ON
  await sleep(150);
  await h.evaluate(() => document.querySelector(".panel-scrim")?.click()); // close menu
  await sleep(150);
  await down(h, ["d"]); await sleep(300);
  s = await aud(h);
  ok("unmute: footsteps resume on next movement", s.muted === false && s.playing.footstepsWalk === true && (s.plays.footstepsWalk || 0) > mutedWalkPlays);
  await up(h, ["d"]); await sleep(150);

  console.log("\n[5] INDEPENDENCE: the opponent's tab tracks its own sounds.");
  const ws = await aud(w);
  ok("Watson's tab has its own audio manager", !!ws);
  ok("Watson heard no footsteps (never moved)", (ws.plays.footstepsWalk || 0) === 0 && (ws.plays.footstepsSprint || 0) === 0);
  ok("Watson got his own tick burst (independent)", (ws.plays.tickBurst || 0) >= 1);

  console.log("\n[6] PERSISTENCE: Sound: OFF survives a page refresh (localStorage).");
  await h.evaluate(() => [...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === "Menu")?.click());
  await sleep(120);
  await h.evaluate(() => [...document.querySelectorAll(".menu-item")].find(b => /Sound/.test(b.textContent))?.click()); // → OFF
  await sleep(150);
  const stored = await h.evaluate(() => localStorage.getItem("wr.soundOn"));
  ok('localStorage persists "wr.soundOn" = "0" when off', stored === "0");
  await h.reload({ waitUntil: "networkidle2" });
  await h.waitForFunction(() => !!window.__wrAudio, { timeout: 5000 }).catch(() => {});
  await sleep(300);
  const reloaded = await aud(h);
  ok("after refresh the manager initialises muted (preference restored)", reloaded && reloaded.muted === true);

  console.log("\n[errors]:", errors.length ? errors.slice(0, 6).join(" | ") : "none");
  ok("no console/page errors", errors.length === 0);
  console.log(`\n=== ${fails === 0 ? "AUDIO 2.4a: ALL PASSED ✓" : fails + " CHECK(S) FAILED ✗"} ===`);
} catch (e) {
  console.error("ERROR:", e.stack || e.message);
  console.log("recent errors:", errors.slice(-6).join(" | "));
  fails++;
} finally {
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
}
