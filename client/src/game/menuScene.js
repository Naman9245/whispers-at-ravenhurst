// Decorative "idle mansion" scene for the main menu (Phase 2.7). Reuses the
// gameplay renderer wholesale: drawBoard paints the floor plan, Character +
// pathBetween drive two autonomous "ghost" detectives wandering room to room.
// Purely cosmetic — no input, no server, no game state.
//
// Design notes:
//  • ONE rAF loop and NO setTimeout/setInterval — every scheduled thing (room
//    light pulses, lightning, ghost idling) is timestamp state checked inside
//    the loop. stop() is just cancelAnimationFrame + an alive flag, so React
//    StrictMode's dev double-mount (start→stop→start) can never leak a timer.
//  • Camera drift is canvas-level: an overdraw scale (1.06) centred on the
//    board plus slow sin/cos offsets. The drift amplitude stays well under the
//    overdraw margin so board edges never show. Non-integer periods mean the
//    ping-pong never visibly repeats.
//  • Ghosts reuse Character unmodified (input-driven): a ~30-line steering
//    adapter feeds setInput() toward the next pathBetween() waypoint. Arrival
//    radius is 10px — the max per-frame step is 8px (160px/s × 50ms dt clamp),
//    so anything smaller can overshoot every frame and oscillate.
//  • prefers-reduced-motion renders a single static frame and schedules nothing.
import { drawBoard } from "./drawBoard.js";
import { Character } from "./Character.js";
import { loadSprites } from "./sprites.js";
import { BOARD_W, BOARD_H, ROOM_IDS, roomRect, pathBetween, PALETTE } from "./boardData.js";

// Kill switch for the wandering detectives (leave the rest of the scene alive)
// in case they misbehave or cost too much on low-end devices.
export const MENU_GHOSTS_ENABLED = true;

const DRIFT_SCALE = 1.06;      // overdraw so drift never exposes the board edge
const DRIFT_X = 12, DRIFT_Y = 8;             // px amplitude (< overdraw margin ~40/26)
const ARRIVE = 10;                           // waypoint arrival radius (> max 8px step)
const GHOST_ALPHA = 0.55;
const LIGHT_EVERY_MIN = 4000, LIGHT_EVERY_MAX = 6000, LIGHT_DUR = 2500;
const LIGHTNING_MIN = 20000, LIGHTNING_MAX = 30000, LIGHTNING_DUR = 260;

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// One autonomous wanderer: idle in a room → pick another room → walk the
// pathBetween() waypoints → idle 2–4s → repeat. A 2s stuck guard drops the
// route and goes idle if collision ever pins us (self-heals corner cases).
class Ghost {
  constructor(ch, now) {
    this.ch = ch;
    this.waypoints = [];
    this.idleUntil = now + rand(400, 2400);  // stagger the first departure
    this.lastX = ch.x; this.lastY = ch.y;
    this.stuckMs = 0;
  }
  update(now, dt) {
    const ch = this.ch;
    if (!this.waypoints.length && now >= this.idleUntil) {
      const next = pick(ROOM_IDS.filter((r) => r !== ch.anchorRoom));
      this.waypoints = pathBetween(ch.anchorRoom, next);
    }
    if (this.waypoints.length) {
      const wp = this.waypoints[0];
      const dx = wp.x - ch.x, dy = wp.y - ch.y;
      const d = Math.hypot(dx, dy);
      if (d < ARRIVE) {
        this.waypoints.shift();
        if (!this.waypoints.length) { ch.setInput(0, 0); this.idleUntil = now + rand(2000, 4000); }
      } else {
        ch.setInput(dx / d, dy / d);
      }
    } else {
      ch.setInput(0, 0);
    }
    ch.update(dt);
    // Stuck guard: walking but feet not advancing → abandon route, idle.
    if (this.waypoints.length && Math.hypot(ch.x - this.lastX, ch.y - this.lastY) < 0.5) {
      this.stuckMs += dt;
      if (this.stuckMs > 2000) {
        this.waypoints = []; ch.setInput(0, 0);
        this.idleUntil = now + rand(2000, 4000); this.stuckMs = 0;
      }
    } else {
      this.stuckMs = 0;
    }
    this.lastX = ch.x; this.lastY = ch.y;
  }
}

// Start the scene on a 1328×860 canvas. Returns stop(). reducedMotion renders
// one static frame (no drift / pulses / lightning / wandering) and returns.
export function startMenuScene(canvas, { reducedMotion = false } = {}) {
  const ctx = canvas.getContext("2d");
  let alive = true;
  let raf = 0;

  // Centre the overdraw scale on the board.
  const baseX = (BOARD_W * (1 - DRIFT_SCALE)) / 2;
  const baseY = (BOARD_H * (1 - DRIFT_SCALE)) / 2;

  const drawScene = (driftX, driftY) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.bg2;
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    ctx.setTransform(DRIFT_SCALE, 0, 0, DRIFT_SCALE, baseX + driftX, baseY + driftY);
    drawBoard(ctx, {});
  };

  if (reducedMotion) {
    drawScene(0, 0);
    return () => { alive = false; };
  }

  // Ghosts load async; the scene runs ghost-less until (and if) sprites land.
  const ghosts = [];
  if (MENU_GHOSTS_ENABLED) {
    const now = performance.now();
    const starts = [pick(ROOM_IDS), pick(ROOM_IDS)];
    Promise.all([loadSprites("holmes"), loadSprites("watson")])
      .then(([h, w]) => {
        if (!alive) return;
        ghosts.push(new Ghost(new Character("holmes", starts[0], h), now));
        ghosts.push(new Ghost(new Character("watson", starts[1], w), now));
      })
      .catch(() => { /* sprite manifest unavailable → scene stays ghost-less */ });
  }

  // Timestamp state for the "scheduled" effects (all checked per frame).
  let light = null;                                  // { room, startedAt }
  let nextLightAt = performance.now() + rand(1500, 3500);
  let lightning = 0;                                 // startedAt (0 = off)
  let nextLightningAt = performance.now() + rand(LIGHTNING_MIN, LIGHTNING_MAX);
  let last = performance.now();

  const loop = (t) => {
    if (!alive) return;
    const dt = Math.min(50, t - last);
    last = t;

    // Camera drift (slow, ping-pong, never-repeating pairing of periods).
    drawScene(DRIFT_X * Math.sin(t / 9000), DRIFT_Y * Math.cos(t / 13000));

    // Room light pulse: one room at a time, brightness up then down.
    if (!light && t >= nextLightAt) light = { room: pick(ROOM_IDS), startedAt: t };
    if (light) {
      const p = (t - light.startedAt) / LIGHT_DUR;
      if (p >= 1) { light = null; nextLightAt = t + rand(LIGHT_EVERY_MIN, LIGHT_EVERY_MAX); }
      else {
        const r = roomRect(light.room);
        ctx.fillStyle = `rgba(255, 214, 120, ${(Math.sin(Math.PI * p) * 0.10).toFixed(3)})`;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    }

    // Ghost detectives (translucent, fully in-board thanks to real collision).
    for (const g of ghosts) {
      g.update(t, dt);
      ctx.globalAlpha = GHOST_ALPHA;
      g.ch.draw(ctx);
      ctx.globalAlpha = 1;
    }

    // Lightning: brief white flicker across the whole scene (visual only —
    // there is no thunder asset yet; it's on the deferred sound list).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!lightning && t >= nextLightningAt) lightning = t;
    if (lightning) {
      const p = (t - lightning) / LIGHTNING_DUR;
      if (p >= 1) { lightning = 0; nextLightningAt = t + rand(LIGHTNING_MIN, LIGHTNING_MAX); }
      else {
        // Two-step flicker: bright pop → dip → softer echo → out.
        const a = p < 0.25 ? 0.55 : p < 0.45 ? 0.12 : 0.4 * (1 - (p - 0.45) / 0.55);
        ctx.fillStyle = `rgba(240, 244, 255, ${a.toFixed(3)})`;
        ctx.fillRect(0, 0, BOARD_W, BOARD_H);
      }
    }

    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  // Dev-only handle so e2e can assert the ghosts actually wander (mirrors
  // window.__wrChar / __wrAudio; never reuses __wrChar — BoardCanvas owns it).
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    window.__wrMenu = {
      ghosts,
      state: () => ({
        ghostsEnabled: MENU_GHOSTS_ENABLED,
        ghosts: ghosts.map((g) => ({
          character: g.ch.character, x: g.ch.x, y: g.ch.y,
          room: g.ch.anchorRoom, walking: g.ch.isMoving(),
        })),
      }),
    };
  }

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    if (typeof window !== "undefined" && window.__wrMenu?.ghosts === ghosts) delete window.__wrMenu;
  };
}
