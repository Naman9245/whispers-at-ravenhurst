// Phase 2.8 Passes D/E/F — the new in-game layout, the case briefing, and the
// suspect rail.
//
// Three things here are worth asserting rather than eyeballing:
//   * the rail's top edge lines up with the board's because they share a grid
//     row. If someone reverts that to a measured offset it will drift silently.
//   * the briefing must NOT block `?menu=skip`, or every other suite hangs on
//     waitForSelector(".board-canvas").
//   * a suspect mark set in the rail has to survive a notebook round trip, which
//     is the whole reason the marks were lifted out of the notebook's own state.
//
// Run against a normal `npm run dev`.
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:5173/", VW = 1600, VH = 900;

let f = 0; const ok = (l, c) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${l}`); if (!c) f++; };
const byText = async (p, t) => { for (const h of await p.$$("button")) if ((await h.evaluate(b => b.textContent.trim())) === t) { await h.click(); return true; } return false; };
const box = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom) }; }, sel);

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 180000, defaultViewport: { width: VW, height: VH }, args: [`--window-size=${VW},${VH}`] });
const errs = [];
try {
  // --- Holmes creates a Timer:Off room so nothing expires mid-suite ---------
  const h = await b.newPage();
  h.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  h.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE: " + m.text()); });
  await h.goto(BASE + "?menu=skip&briefing=1", { waitUntil: "networkidle2" });
  await h.waitForSelector(".lobby"); await byText(h, "Create Room");
  await h.waitForSelector(".lobby-form");
  await h.evaluate(() => {
    const rows = [...document.querySelectorAll(".set-row")];
    rows.find(r => /Time limit/.test(r.textContent)).querySelector(".set-opt").click();
    const g = rows.find(r => /Accuse opens/.test(r.textContent));
    [...g.querySelectorAll(".set-opt")].find(x => x.textContent.trim() === "Now").click();
  });
  await sleep(150);
  await byText(h, "Create");
  await h.waitForSelector(".lb-code-display");
  const code = await h.$eval(".lb-code-display", (e) => e.textContent.trim());

  const w = await b.newPage(); await w.setViewport({ width: VW, height: VH });
  await w.goto(BASE + "?menu=skip", { waitUntil: "networkidle2" });
  await w.waitForSelector(".lobby"); await byText(w, "Join with Code");
  await w.waitForSelector(".lb-input.code"); await w.type(".lb-input.code", code, { delay: 20 });
  await byText(w, "Join");
  await sleep(1200);

  console.log("\n[1] The briefing TYPES the case out — and only when asked for.");
  await h.bringToFront(); await sleep(700);

  // Mid-type: the story is on screen but unfinished, on a black ground, with a
  // caret. If this ever comes back complete on the first frame, the cinematic has
  // quietly reverted to being a wall of text.
  const mid = await h.evaluate(() => {
    const s = document.querySelector(".briefing-screen");
    if (!s) return null;
    return {
      bg: getComputedStyle(s).backgroundColor,
      typed: (s.querySelector(".brief-opening")?.textContent || "").length,
      caret: !!s.querySelector(".mm-caret"),
      castYet: s.querySelectorAll(".brief-cast li").length,
      go: !!s.querySelector(".briefing-go"),
    };
  });
  console.log("   mid-type:", JSON.stringify(mid));
  await h.screenshot({ path: ".shots/layout-0-briefing.png" });
  ok("the page is actually black", (mid?.bg || "").replace(/\s/g, "") === "rgb(0,0,0)");
  ok("it has started typing", (mid?.typed || 0) > 5);
  ok("but has NOT finished", (mid?.typed || 0) < 250);
  ok("a caret is blinking", mid?.caret === true);
  ok("the cast waits its turn", mid?.castYet === 0);
  ok("and you cannot enter yet", mid?.go === false);

  // Any key fast-forwards past the whole cinematic.
  await h.keyboard.press("Space");
  await sleep(600);
  const brief = await h.evaluate(() => {
    const s = document.querySelector(".briefing-screen");
    if (!s) return null;
    return {
      victim: s.querySelector(".brief-name")?.textContent || "",
      opening: (s.querySelector(".brief-opening")?.textContent || "").length,
      backstory: (s.querySelector(".brief-back")?.textContent || "").length,
      cast: s.querySelectorAll(".brief-cast li").length,
      rules: [...s.querySelectorAll(".brief-rules li")].map(x => x.textContent),
      caseNo: s.querySelector(".briefing-case")?.textContent || "",
    };
  });
  console.log("   briefing:", JSON.stringify(brief));
  ok("a keypress skips to the whole story", !!brief);
  ok("it names the victim", /Ashworth/.test(brief?.victim || ""));
  ok("it tells the opening", (brief?.opening || 0) > 80);
  ok("it gives the backstory", (brief?.backstory || 0) > 80);
  ok("it lists all six suspects", brief?.cast === 6);
  ok("it states the house rules", (brief?.rules || []).some(t => /No time limit/i.test(t)));
  ok("it shows the case number", /CASE Nº/.test(brief?.caseNo || ""));

  // Watson used plain ?menu=skip and must be on the board already -- if the
  // briefing ever blocks that, every other suite in .shots hangs.
  ok("?menu=skip alone SKIPS the briefing", await w.evaluate(() => !document.querySelector(".briefing-screen") && !!document.querySelector(".board-canvas")));

  await byText(h, "Enter the Manor");
  await h.waitForSelector(".board-canvas");
  await sleep(600);
  ok("Enter the Manor reaches the board", await h.evaluate(() => !document.querySelector(".briefing-screen")));

  console.log("\n[2] Layout: one hero, one gutter, edges that line up.");
  const bar = await box(h, ".hud-bar"), board = await box(h, ".board-hero");
  const strip = await box(h, ".tab-strip"), rail = await box(h, ".suspect-rail");
  console.log("   bar:", JSON.stringify(bar), "\n   board:", JSON.stringify(board), "\n   strip:", JSON.stringify(strip), "\n   rail:", JSON.stringify(rail));
  ok("top bar is still ~68px", bar.h >= 60 && bar.h <= 80);
  ok("the rail's top edge matches the board's", Math.abs(rail.y - board.y) <= 1);
  ok("the rail's bottom matches the strip's", Math.abs(rail.b - strip.b) <= 1);
  ok("one gutter between board and rail", Math.abs((rail.x - (board.x + board.w)) - 12) <= 1);
  ok("one gutter between board and strip", Math.abs((strip.y - board.b) - 12) <= 1);
  ok("the board is still the hero", board.h > strip.h * 2 && board.w > rail.w * 2);

  console.log("\n[3] The top bar is a scoreboard: you | clock | rival.");
  const top = await h.evaluate(() => ({
    avatars: document.querySelectorAll(".hud-avatar").length,
    counts: [...document.querySelectorAll(".ct-count")].map(e => e.textContent),
    pips: document.querySelectorAll(".hud-player .cp-dot").length,
    rivalName: document.querySelector(".rv-name")?.textContent || "",
    rivalStatus: document.querySelector(".rv-status")?.textContent || "",
    room: document.querySelector(".hp-room")?.textContent || "",
    phase: document.querySelector(".tb-phase")?.textContent || "",
  }));
  console.log("   top bar:", JSON.stringify(top));
  ok("both detectives have a portrait", top.avatars === 2);
  ok("both progress readouts are present", top.counts.length === 2);
  ok("seven pips a side", top.pips === 7);
  ok("the rival is named", top.rivalName.length > 0);
  ok("and has a status line", /Investigating|LOCKED IN|Disconnected/.test(top.rivalStatus));
  ok("your room still reads in .hp-room", /STUDY/i.test(top.room));
  ok("the clock explains itself (NO LIMIT)", /NO LIMIT|STORM SEALED/.test(top.phase));

  console.log("\n[4] The strip is collapsed until asked, then holds the story.");
  ok("no panel on arrival", await h.evaluate(() => !document.querySelector(".ts-panel")));
  await h.evaluate(() => [...document.querySelectorAll(".ts-tab")].find(t => /Scenario/.test(t.textContent)).click());
  await sleep(250);
  const scen = await h.evaluate(() => ({
    open: !!document.querySelector(".ts-panel"),
    victim: document.querySelector(".ts-panel .brief-name")?.textContent || "",
    cast: document.querySelectorAll(".ts-panel .brief-cast li").length,
  }));
  ok("Scenario opens the same case body", scen.open && /Ashworth/.test(scen.victim) && scen.cast === 6);
  // The panel is content-sized, so `contain: size` on it would collapse it to
  // padding -- visibly open, and empty. Assert it actually got room.
  const panelH = (await box(h, ".ts-panel"))?.h || 0;
  const boardAfter = (await box(h, ".board-hero"))?.h || 0;
  console.log(`   panel ${panelH}px, board now ${boardAfter}px`);
  ok("the open panel has real height", panelH > 120);
  ok("and it took that room from the board, not the viewport", boardAfter < board.h);
  await h.evaluate(() => [...document.querySelectorAll(".ts-tab")].find(t => /Log/.test(t.textContent)).click());
  await sleep(250);
  ok("Log shows the activity feed", await h.evaluate(() => document.querySelectorAll(".ts-log .activity-line").length > 0));
  await h.evaluate(() => [...document.querySelectorAll(".ts-tab")].find(t => /Log/.test(t.textContent)).click());
  await sleep(250);
  ok("clicking the open tab closes it again", await h.evaluate(() => !document.querySelector(".ts-panel")));

  console.log("\n[5] The rail: six cards that flip to a dossier.");
  const cards = await h.evaluate(() => document.querySelectorAll(".sus-card").length);
  ok("six suspects in the rail", cards === 6);
  await h.evaluate(() => document.querySelector(".sus-card .sus-flip").click());
  await sleep(500);
  const bio = await h.evaluate(() => {
    const c = document.querySelector(".sus-card");
    return {
      flipped: c.classList.contains("flipped"),
      rows: [...c.querySelectorAll(".sus-bio-row")].map(r => r.textContent),
      flavour: c.querySelector(".sus-flavour")?.textContent || "",
    };
  });
  console.log("   dossier:", JSON.stringify(bio));
  ok("the card flips", bio.flipped);
  ok("the dossier lists age/height/build/handedness/occupation", bio.rows.length === 5);
  // Handedness is the attribute the ligature clue keys off. If it ever stops
  // reaching the card, that clue becomes unanswerable.
  ok("handedness is on the card", bio.rows.some(r => /Handed/.test(r)));
  ok("and it tells you to compare it against the evidence", /compare this against/i.test(bio.flavour));

  console.log("\n[6] Marks are owned by the app, not the notebook.");
  await h.evaluate(() => document.querySelector(".sus-card .sus-flip").click());
  await sleep(450);
  await h.evaluate(() => document.querySelector(".sus-card .sus-front").click());
  await sleep(250);
  const marked = await h.evaluate(() => document.querySelector(".sus-card")?.className || "");
  ok("clicking a card body marks the suspect", /status-suspected/.test(marked));

  await h.evaluate(() => [...document.querySelectorAll(".hud-tool")].find(t => /Notebook/.test(t.textContent)).click());
  await sleep(400);
  const nbTabs = await h.evaluate(() => [...document.querySelectorAll(".nb-tab")].map(t => t.textContent.trim()));
  console.log("   notebook tabs:", JSON.stringify(nbTabs));
  ok("the notebook no longer duplicates the suspects", nbTabs.length === 2 && !nbTabs.some(t => /SUSPECT/i.test(t)));
  await h.evaluate(() => [...document.querySelectorAll(".hud-tool")].find(t => /Notebook/.test(t.textContent)).click());
  await sleep(400);
  ok("the mark survived the notebook round trip", /status-suspected/.test(await h.evaluate(() => document.querySelector(".sus-card")?.className || "")));

  console.log("\n[7] Screenshots.");
  await h.screenshot({ path: ".shots/layout-1-stage.png" });
  await h.evaluate(() => [...document.querySelectorAll(".ts-tab")].find(t => /Scenario/.test(t.textContent)).click());
  await sleep(300);
  await h.screenshot({ path: ".shots/layout-2-scenario.png" });
  console.log("   -> .shots/layout-{1-stage,2-scenario}.png");

  console.log("\n[errors]:", errs.length ? errs.slice(0, 5).join(" | ") : " none");
  ok("no console/page errors", errs.length === 0);
} catch (e) {
  console.error("ERROR:", e.message);
  f++;
} finally { await b.close(); }
console.log(`\n=== ${f === 0 ? "LAYOUT/BRIEFING/RAIL: ALL PASSED ✓" : f + " FAILED ✗"} ===\n`);
process.exit(f ? 1 : 0);
