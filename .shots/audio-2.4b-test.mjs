// Phase 2.4b e2e: verify the ambient + UI + dramatic sound wiring (rain bed,
// random creaks, button click, notebook open, accusation lock-in, reveal).
// Headless Chrome has no speakers, so — like the 2.4a suite — we assert on the
// sound manager's observable state via window.__wrAudio.state() (per-sound play
// counts + each element's paused flag). What's verified on the REAL path:
//   • rain starts with gameplay, resumes on unmute, and STOPS at the reveal
//   • the UI click fires on real button clicks (pills + a modal-close, via App's
//     delegated <button> listener — not just the action bar)
//   • the notebook swish fires on EVERY notebook interaction (open, tab switch,
//     close) and those buttons do NOT also fire the generic click (opt-out)
//   • the reveal sting fires on the real dev-mode soft-cap force-resolve (60s)
// The random creaks (30–90s scheduler) and the accusation-lock-in sting are
// exercised deterministically through the dev-only window.__wrAudio.fire.* handle
// — they still route through fire(), so mute/unlock behaviour is the real thing.
// Needs client (:5173) + server (:3001) running. Uses DEV MODE (60s soft cap).
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173/?menu=skip", VW = 1600, VH = 900;
let fails = 0;
const ok = (l, c) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${l}`); if (!c) fails++; };
const clickByText = async (p, t) => { for (const h of await p.$$("button")) if ((await h.evaluate(b => b.textContent.trim())) === t) { await h.click(); return true; } return false; };
const aud = (p) => p.evaluate(() => (window.__wrAudio ? window.__wrAudio.state() : null));
const fireSound = (p, name) => p.evaluate((n) => window.__wrAudio.fire[n](), name);
const clickTitle = (p, title) => p.evaluate((t) => [...document.querySelectorAll("button")].find(b => b.title === t)?.click(), title);
const clickMenu = (p, re) => p.evaluate((r) => [...document.querySelectorAll(".menu-item")].find(b => new RegExp(r).test(b.textContent))?.click(), re.source);
const openMenu = (p) => p.evaluate(() => [...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === "Menu")?.click());

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
  await h.waitForSelector(".board-canvas"); await sleep(1200);
  const joinAt = Date.now();               // dev-mode soft cap (~60s) is armed around here
  await h.bringToFront(); await h.mouse.click(VW / 2, VH / 2); // ensure audio unlocked
  await h.waitForFunction(() => !!window.__wrAudio);

  console.log("\n[0] Audio manager loaded + unlocked (both tabs).");
  let s = await aud(h);
  ok("Holmes: __wrAudio handle present", !!s);
  ok("Holmes: unlocked after first gesture", s.unlocked === true);
  ok("Holmes: starts un-muted", s.muted === false);
  ok("dev fire.* handle exposed for e2e", await h.evaluate(() => !!(window.__wrAudio && window.__wrAudio.fire)));

  console.log("\n[1] RAIN BED: quiet loop starts with gameplay, single loop (no stacking).");
  s = await aud(h);
  ok("rain loop is playing during the game", s.playing.rain === true);
  ok("rain started (plays.rain >= 1)", (s.plays.rain || 0) >= 1);
  const rainPlays = s.plays.rain || 0;
  await sleep(1000);
  s = await aud(h);
  ok("rain does not stack/restart (still one play, still playing)", s.playing.rain === true && (s.plays.rain || 0) === rainPlays);
  ok("rain sits well below gameplay sounds in the mix (element volume 0.04)", await h.evaluate(() => Math.abs(window.__wrAudio.bank.rain.volume - 0.04) < 1e-6));

  console.log("\n[2] UI CLICK: fires on every button (pills + modal close), delegated listener.");
  let b = await aud(h);
  await clickByText(h, "MOVE"); await sleep(120);
  s = await aud(h);
  ok("MOVE pill → click fired", (s.plays.buttonClick || 0) > (b.plays.buttonClick || 0));
  b = s;
  await clickByText(h, "QUESTION"); await sleep(150);    // opens the suspect modal
  s = await aud(h);
  ok("QUESTION pill → click fired", (s.plays.buttonClick || 0) > (b.plays.buttonClick || 0));
  b = s;
  // Buttons INSIDE a modal: the modal wrapper calls e.stopPropagation(), so only a
  // CAPTURE-phase listener catches these — this is the case the fix addresses.
  await h.click(".suspect-modal .suspect-card"); await sleep(150);   // pick a suspect
  s = await aud(h);
  ok("suspect card (inside stopPropagation modal) → click fired", (s.plays.buttonClick || 0) > (b.plays.buttonClick || 0));
  b = s;
  await h.click(".suspect-modal .modal-close"); await sleep(150);    // close × (also inside modal)
  s = await aud(h);
  ok("modal close × → click fired (delegated, not action-bar-only)", (s.plays.buttonClick || 0) > (b.plays.buttonClick || 0));
  await h.keyboard.press("Escape"); await sleep(100);      // safety: ensure the modal is fully closed

  console.log("\n[2b] NOTEBOOK SWISH: on open + every tab switch + close; no generic click.");
  b = await aud(h);
  const clickBefore = b.plays.buttonClick || 0;
  await clickTitle(h, "Notebook"); await sleep(150);     // OPEN
  s = await aud(h);
  ok("Notebook OPEN → swish fired", (s.plays.notebookOpen || 0) > (b.plays.notebookOpen || 0));
  ok("Notebook OPEN → no generic click (opted out)", (s.plays.buttonClick || 0) === clickBefore);
  b = s;
  await clickByText(h, "WEAPONS"); await sleep(120);     // tab switch
  s = await aud(h);
  ok("tab switch → Weapons → swish fired", (s.plays.notebookOpen || 0) > (b.plays.notebookOpen || 0));
  b = s;
  await clickByText(h, "ROOMS"); await sleep(120);        // tab switch
  s = await aud(h);
  ok("tab switch → Rooms → swish fired", (s.plays.notebookOpen || 0) > (b.plays.notebookOpen || 0));
  ok("tab switches never fired the generic click (opted out)", (s.plays.buttonClick || 0) === clickBefore);
  b = s;
  await clickTitle(h, "Notebook"); await sleep(150);     // CLOSE
  s = await aud(h);
  ok("Notebook CLOSE → swish fired (every interaction, not open-only)", (s.plays.notebookOpen || 0) > (b.plays.notebookOpen || 0));

  console.log("\n[3] RANDOM CREAKS: door / floor fire correctly (via dev handle).");
  b = await aud(h);
  await fireSound(h, "playDoorCreak"); await sleep(80);
  s = await aud(h);
  ok("door creak fires", (s.plays.doorCreak || 0) > (b.plays.doorCreak || 0));
  b = s;
  await fireSound(h, "playFloorCreak"); await sleep(80);
  s = await aud(h);
  ok("floor creak fires", (s.plays.floorCreak || 0) > (b.plays.floorCreak || 0));

  console.log("\n[4] DRAMATIC: accusation lock-in sting (via dev handle).");
  b = await aud(h);
  await fireSound(h, "playAccusationLockIn"); await sleep(80);
  s = await aud(h);
  ok("accusation lock-in sting fires", (s.plays.accusationLockIn || 0) > (b.plays.accusationLockIn || 0));

  console.log("\n[5] MUTE: stops the rain bed + suppresses every 2.4b sound; unmute resumes rain.");
  await openMenu(h); await sleep(120);
  await clickMenu(h, /Sound/); await sleep(200);   // → OFF
  s = await aud(h);
  ok("mute stops the rain bed immediately", s.muted === true && s.playing.rain === false);
  const mutedClick = s.plays.buttonClick || 0, mutedCreak = s.plays.doorCreak || 0, mutedSting = s.plays.accusationLockIn || 0;
  // Attempt every 2.4b one-shot via the fire handle while muted — none may sound.
  // (Handle calls, not DOM clicks, so the open menu's scrim can't be disturbed.)
  await fireSound(h, "playButtonClick"); await fireSound(h, "playDoorCreak"); await fireSound(h, "playAccusationLockIn"); await sleep(80);
  s = await aud(h);
  ok("muted: no click sound", (s.plays.buttonClick || 0) === mutedClick);
  ok("muted: no creak", (s.plays.doorCreak || 0) === mutedCreak);
  ok("muted: no dramatic sting", (s.plays.accusationLockIn || 0) === mutedSting);
  await clickMenu(h, /Sound/); await sleep(150);    // → ON (menu still open; evaluate click)
  await h.evaluate(() => document.querySelector(".panel-scrim")?.click()); await sleep(150);  // close menu
  s = await aud(h);
  ok("unmute: rain bed resumes automatically", s.muted === false && s.playing.rain === true);

  console.log("\n[6] REVEAL (real path): dev-mode soft cap force-resolves ~60s → reveal sting, rain stops.");
  b = await aud(h);
  ok("reveal sting has not fired yet (mid-game)", (b.plays.reveal || 0) === 0);
  const waited = Date.now() - joinAt;
  console.log(`  (…waiting out the soft cap; ${Math.round(waited / 1000)}s elapsed since join)`);
  await h.waitForSelector(".reveal-screen", { timeout: 90000 });
  await sleep(300);
  s = await aud(h);
  ok("reveal sting fired as the screen appeared", (s.plays.reveal || 0) >= 1);
  ok("reveal sting fired exactly once", (s.plays.reveal || 0) === 1);
  ok("rain bed stopped at the reveal", s.playing.rain === false);

  console.log("\n[7] INDEPENDENCE: the opponent's tab tracks its own sounds (no leak).");
  const ws = await aud(w);
  ok("Watson has his own audio manager", !!ws);
  // Clean no-leak proofs: sounds Watson NEVER triggered must be zero on his tab —
  // proving no cross-tab leakage. (Watson legitimately has his own buttonClick count
  // from his lobby clicks and his own creak scheduler; those aren't leaks.)
  ok("Watson heard no notebook swish (never opened his notebook)", (ws.plays.notebookOpen || 0) === 0);
  ok("Watson heard no lock-in sting (fired only on Holmes' tab)", (ws.plays.accusationLockIn || 0) === 0);
  ok("Watson got his own reveal sting (independent)", (ws.plays.reveal || 0) >= 1);
  await w.waitForSelector(".reveal-screen", { timeout: 5000 }).catch(() => {});
  const ws2 = await aud(w);
  ok("Watson's rain bed also stopped at the reveal", ws2.playing.rain === false);

  console.log("\n[errors]:", errors.length ? errors.slice(0, 6).join(" | ") : "none");
  ok("no console/page errors", errors.length === 0);
  console.log(`\n=== ${fails === 0 ? "AUDIO 2.4b: ALL PASSED ✓" : fails + " CHECK(S) FAILED ✗"} ===`);
} catch (e) {
  console.error("ERROR:", e.stack || e.message);
  console.log("recent errors:", errors.slice(-6).join(" | "));
  fails++;
} finally {
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
}
