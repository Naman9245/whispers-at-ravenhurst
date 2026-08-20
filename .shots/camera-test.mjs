// Phase 2.8 Pass C — the zoom-and-follow camera and the manor map overlay.
//
// The camera is the biggest renderer change since the static bake, and its two
// worst failure modes are both SILENT: a click handler that no longer inverts
// the transform simply stops examining things, and a per-frame re-bake just
// makes the game quietly slower. Both are asserted here.
//
// Run against a normal Dev-Mode `npm run dev`.
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:5173/?menu=skip", VW = 1600, VH = 900;
const BOARD_W = 1472, BOARD_H = 860;

let f = 0; const ok = (l, c) => { console.log(`${c ? "  ✓" : "  ✗ FAIL"} ${l}`); if (!c) f++; };
const byText = async (p, t) => { for (const h of await p.$$("button")) if ((await h.evaluate(b => b.textContent.trim())) === t) { await h.click(); return true; } return false; };
const pos = p => p.evaluate(() => ({ x: window.__wrChar.x, y: window.__wrChar.y, room: window.__wrChar.anchorRoom }));
const place = (p, x, y) => p.evaluate(({ x, y }) => { window.__wrChar.x = x; window.__wrChar.y = y; }, { x, y });
const cam = p => p.evaluate(() => ({ x: window.__wrCam.x, y: window.__wrCam.y, zoom: window.__wrCam.zoom }));
const bakes = p => p.evaluate(() => window.__wrBoard?.bakes ?? -1);
const hold = async (p, k, ms) => { await p.keyboard.down(k); await sleep(ms); await p.keyboard.up(k); await sleep(120); };

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 180000, defaultViewport: { width: VW, height: VH }, args: [`--window-size=${VW},${VH}`, "--autoplay-policy=no-user-gesture-required"] });
const errs = [];
try {
  const h = await b.newPage();
  h.on("pageerror", e => errs.push("PAGEERROR: " + e.message));
  h.on("console", m => { if (m.type() === "error") errs.push("CONSOLE: " + m.text()); });
  await h.goto(URL, { waitUntil: "networkidle2" });
  await h.waitForSelector(".lobby"); await byText(h, "Create Room");
  await h.waitForSelector(".lobby-form");
  await h.click('.lb-check input[type="checkbox"]');   // Dev Mode: short timers
  await byText(h, "Create");
  await h.waitForSelector(".lb-code-display");
  const code = await h.$eval(".lb-code-display", e => e.textContent.trim());

  const w = await b.newPage(); await w.setViewport({ width: VW, height: VH });
  await w.goto(URL, { waitUntil: "networkidle2" });
  await w.waitForSelector(".lobby"); await byText(w, "Join with Code");
  await w.waitForSelector(".lb-input.code"); await w.type(".lb-input.code", code, { delay: 20}); await byText(w, "Join");
  await h.waitForSelector(".board-canvas");
  await h.waitForFunction(() => !!window.__wrChar && !!window.__wrCam);
  await h.bringToFront(); await sleep(1200);

  console.log("\n[1] The camera exists, is zoomed in, and is framed on the detective.");
  const c0 = await cam(h), p0 = await pos(h);
  console.log(`   cam ${c0.x.toFixed(0)},${c0.y.toFixed(0)} zoom ${c0.zoom} | feet ${p0.x.toFixed(0)},${p0.y.toFixed(0)}`);
  ok("zoomed in (zoom > 1)", c0.zoom > 1);
  // NOT "centred on the detective": near a wall the clamp deliberately stops the
  // camera before the view would show the void outside the board, so the right
  // property is that the detective is on screen, not that they are dead centre.
  const visible = (k, pt) => Math.abs(k.x - pt.x) <= BOARD_W / (2 * k.zoom)
                          && Math.abs(k.y - pt.y) <= BOARD_H / (2 * k.zoom);
  ok("the detective is inside the view", visible(c0, p0));

  console.log("\n[2] The bake happens ONCE, and stays once while the camera moves.");
  // The whole point of the offscreen bake is that the detail is paid for a single
  // time. A camera that invalidated it per frame would look identical and run
  // like treacle, so this is the assertion that catches it.
  const bake0 = await bakes(h);
  ok("baked exactly once on arrival", bake0 === 1);
  await hold(h, "d", 700); await hold(h, "s", 700); await hold(h, "a", 700);
  await sleep(400);
  ok("still exactly one bake after walking", (await bakes(h)) === 1);

  console.log("\n[3] The camera FOLLOWS.");
  const before = await cam(h);
  await place(h, 1236, 614);   // conservatory centre — a teleport, not a walk
  await sleep(800);
  const after = await cam(h), pAfter = await pos(h);
  ok("camera moved with the detective", Math.hypot(after.x - before.x, after.y - before.y) > 200);
  ok("and they are on screen at the far end of the board", visible(after, pAfter));

  console.log("\n[4] It CLAMPS at every corner — the void past the walls is never shown.");
  const halfW = BOARD_W / (2 * after.zoom), halfH = BOARD_H / (2 * after.zoom);
  const corners = [[0, 0], [BOARD_W, 0], [0, BOARD_H], [BOARD_W, BOARD_H]];
  for (const [cx, cy] of corners) {
    await place(h, cx, cy); await sleep(500);
    const k = await cam(h);
    const inX = k.x >= halfW - 1 && k.x <= BOARD_W - halfW + 1;
    const inY = k.y >= halfH - 1 && k.y <= BOARD_H - halfH + 1;
    ok(`clamped at (${cx},${cy})`, inX && inY);
  }

  console.log("\n[5] Pressing E still works (a control, not a coordinate).");
  // E goes first: `activeId` only ever points at an UNEXAMINED hotspot, so a
  // click test running before this would consume the spot and leave E with
  // nothing to find — which looks exactly like a broken key binding.
  await place(h, 278, 206); await sleep(700);   // beside the study desk
  await hold(h, "e", 180);
  let pressed = true;
  try { await h.waitForSelector(".examine-modal", { timeout: 9000 }); } catch { pressed = false; }
  ok("E examines the adjacent hotspot", pressed);
  if (pressed) { await h.keyboard.press("Escape"); await sleep(500); }

  console.log("\n[6] Click-to-examine still lands — the camera inverse works.");
  // The silent one. The click handler is the only canvas->board mapping in the
  // client; miss the inverse and clicking a hotspot just quietly stops working.
  // The target comes from __wrHotspot rather than hardcoded pixels, so moving a
  // piece of furniture can never turn this into a false failure.
  const box = await h.$eval(".board-canvas", e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  let target = null;
  for (const [x, y] of [[236, 300], [278, 300], [340, 250], [236, 206], [300, 160]]) {
    await place(h, x, y); await sleep(500);
    target = await h.evaluate(() => window.__wrHotspot?.());
    if (target) break;
  }
  ok("found an unexamined hotspot to click", !!target);
  if (target) {
    console.log(`   target ${target.id} at world ${target.x.toFixed(0)},${target.y.toFixed(0)}`);
    const v = await h.evaluate(([x, y]) => window.__wrCam.toView(x, y), [target.x, target.y]);
    await h.mouse.click(box.l + v.x * (box.w / BOARD_W), box.t + v.y * (box.h / BOARD_H));
    let clicked = true;
    try { await h.waitForSelector(".examine-modal", { timeout: 6000 }); } catch { clicked = false; }
    ok("clicking a hotspot through the camera opens the examine modal", clicked);
    if (clicked) { await h.keyboard.press("Escape"); await sleep(400); }
  }

  console.log("\n[7] The manor map is HIDDEN until asked for.");
  ok("no map overlay on arrival", (await h.$(".map-overlay")) === null);
  await h.keyboard.press("m"); await sleep(400);
  ok("M opens it", (await h.$(".map-overlay")) !== null);

  const mw = await h.$eval(".map-overlay", e => e.getBoundingClientRect().width);
  console.log(`   map panel ${mw.toFixed(0)}px of ${VW}px viewport`);
  ok("it is COMPACT, not full width (< 50% of the viewport)", mw < VW * 0.5);

  const foot = await h.$eval(".map-foot", e => e.textContent);
  console.log("   ", foot.replace(/\s+/g, " ").trim());
  ok("it says where you are", /you are in/i.test(foot));

  // The dot is YOU, and it moves. The map used to highlight whichever room you
  // were in, which meant it kept naming the room you had just walked out of and
  // showed nothing at all about where you actually were in the corridor.
  const mapPixels = () => h.$eval(".map-canvas", (c) => c.toDataURL());
  await place(h, 236, 246); await sleep(500);   // study, near the centre
  const inStudy = await h.$eval(".map-foot", e => e.textContent);
  const pixStudy = await mapPixels();

  await place(h, 736, 430); await sleep(600);   // the corridor, between rooms
  const inCorridor = await h.$eval(".map-foot", e => e.textContent);
  const pixCorridor = await mapPixels();
  console.log("   study ->", inStudy.split("Filled")[0].trim(), "| corridor ->", inCorridor.split("Filled")[0].trim());

  ok("standing in a room, it names that room", /STUDY/i.test(inStudy));
  ok("standing in the corridor, it says CORRIDOR", /corridor/i.test(inCorridor));
  ok("and it stops claiming the room you left", !/STUDY/i.test(inCorridor));
  ok("the you-are-here dot actually moved", pixStudy !== pixCorridor);

  await place(h, 236, 246); await sleep(400);
  await h.keyboard.press("m"); await sleep(300);
  ok("M closes it again", (await h.$(".map-overlay")) === null);
  await h.keyboard.press("m"); await sleep(300);
  await h.keyboard.press("Escape"); await sleep(300);
  ok("Esc closes it too", (await h.$(".map-overlay")) === null);

  console.log("\n[8] Screenshots.");
  await place(h, 236, 300); await sleep(700);
  await h.screenshot({ path: ".shots/camera-1-study.png" });
  await place(h, 1236, 614); await sleep(900);
  await h.screenshot({ path: ".shots/camera-2-conservatory.png" });
  await h.keyboard.press("m"); await sleep(500);
  await h.screenshot({ path: ".shots/camera-3-map.png" });
  console.log("   -> .shots/camera-{1-study,2-conservatory,3-map}.png");

  console.log("\n[errors]:", errs.length ? "\n" + errs.join("\n") : " none");
  ok("no console/page errors", errs.length === 0);
} catch (e) { console.error("SCRIPT ERROR:", e.message); f++; }
finally { await b.close(); console.log(`\n=== CAMERA: ${f === 0 ? "ALL PASSED ✓" : f + " FAILED ✗"} ===`); process.exit(f ? 1 : 0); }
