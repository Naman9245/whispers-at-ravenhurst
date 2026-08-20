import { useRef, useEffect } from "react";
import {
  drawBoard, drawHotspots, drawOccluders, drawOverhead, drawExamineGlow, drawBubble, searchBubbleScale,
} from "./drawBoard.js";
import { BOARD_W, BOARD_H, PALETTE, ROOM_IDS, roomRect } from "./boardData.js";
import { makeCamera, VIEW_W, VIEW_H, DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM } from "./camera.js";
import { ROOM_HOTSPOTS } from "@shared/roomHotspots.js";
import { objectsIn, distanceToRect } from "@shared/roomObjects.js";
import { preloadObjectSprites } from "./objectSprites.js";
import { EXAMINE_RADIUS } from "@shared/constants.js";
import { loadSprites } from "./sprites.js";
import { Character } from "./Character.js";
import { playFootstepsWalk, playFootstepsSprint, stopFootsteps } from "./sound.js";
import { setPlayerPos } from "./playerPos.js";

// Reach is measured to the nearest point of the furniture's rect, so "in range"
// means standing beside the piece — which is the only way a SOLID object could
// ever be examined (its centre is unreachable by definition).
const HOTSPOT_RADIUS = EXAMINE_RADIUS;

// Feet -> nearest point of object `id` in `room`, or Infinity if it has no rect.
function reachOf(room, id, feetX, feetY) {
  const o = objectsIn(room).find((x) => x.id === id);
  if (!o) return Infinity;
  const r = roomRect(room);
  return distanceToRect(feetX - r.x, feetY - r.y, o);
}

/**
 * Renders the mansion and THIS client's own character (privacy: never the
 * opponent). Movement is free-roam WASD/arrows. Each frame it also draws the
 * CURRENT room's hotspot indicators and tracks the nearest unexamined one; the
 * player examines it with the **E** key or by clicking its icon (both
 * proximity-gated). On entering a new room (or the corridor) it calls
 * onRegionChange so the parent can tell the server.
 *
 * Props: me, startRoom, showReachable, inputEnabled, examined[], onExamine(id),
 *        onRegionChange(room, inCorridor)
 */
export default function BoardCanvas({
  me = "holmes", startRoom = "study", showReachable = false, inputEnabled = true,
  sprintEnabled = true, showMarkers = true,
  examined = [], searchingId = null, searchingStart = null, onExamine, onRegionChange,
}) {
  const canvasRef = useRef(null);
  const charRef = useRef(null);
  const camRef = useRef(null);
  const keysRef = useRef({});
  const showReachableRef = useRef(showReachable);
  const inputEnabledRef = useRef(inputEnabled);
  // Host settings. The rAF effect below has an empty dep array and never re-runs,
  // so anything the loop reads from props has to come through a ref.
  const sprintEnabledRef = useRef(sprintEnabled);
  const showMarkersRef = useRef(showMarkers);
  const regionCbRef = useRef(onRegionChange);
  const examinedRef = useRef(new Set());
  const onExamineRef = useRef(onExamine);
  const activeIdRef = useRef(null);
  const activeXYRef = useRef(null);   // { id, x, y } in world px — dev handle only
  const ePrevRef = useRef(false);
  const searchingIdRef = useRef(null);
  const searchStartRef = useRef(null);
  showReachableRef.current = showReachable;
  inputEnabledRef.current = inputEnabled;
  sprintEnabledRef.current = sprintEnabled;
  showMarkersRef.current = showMarkers;
  regionCbRef.current = onRegionChange;
  examinedRef.current = new Set(examined);
  onExamineRef.current = onExamine;
  searchingIdRef.current = searchingId;
  searchStartRef.current = searchingStart;

  // Furniture art, if any is declared. No-ops entirely while roomObjects.js
  // declares zero sprite paths, which is the shipping state today.
  useEffect(() => { preloadObjectSprites(); }, []);

  // Load (or swap) sprites for the controlled character.
  useEffect(() => {
    let alive = true;
    loadSprites(me).then((data) => {
      if (!alive) return;
      if (charRef.current) {
        charRef.current.character = me;
        charRef.current.setSprites(data);
      } else {
        const ch = new Character(me, startRoom, data);
        ch.onRegionChange = (room, inCorridor) => regionCbRef.current?.(room, inCorridor);
        charRef.current = ch;
        const cam = makeCamera();
        cam.snapTo(ch.x, ch.y);   // start framed on the detective, don't ease in from the centre
        camRef.current = cam;
        // Dev-only handles for e2e (stripped from prod builds). __wrCam turns
        // world px into view px; __wrHotspot reports the in-reach hotspot's world
        // position, so the suites can click one without hardcoding furniture
        // geometry that a layout change would silently invalidate.
        if (import.meta.env.DEV) {
          window.__wrChar = ch;
          window.__wrCam = cam;
          window.__wrHotspot = () => activeXYRef.current;
        }
      }
    });
    return () => { alive = false; };
  }, [me, startRoom]);

  // Keyboard input (WASD + arrows + E). Tracked globally; ignored when disabled.
  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      // DEV-only zoom nudge. The right framing is a judgement call that has to be
      // made with the game running, so [ and ] adjust it live rather than forcing
      // a rebuild per guess. Never shipped: import.meta.env.DEV strips this.
      if (import.meta.env.DEV && camRef.current && (k === "[" || k === "]")) {
        camRef.current.setZoom(camRef.current.zoom + (k === "]" ? 0.05 : -0.05));
        console.log("[camera] zoom", camRef.current.zoom.toFixed(2));
      }
      keysRef.current[k] = true;
    };
    const up = (e) => { keysRef.current[e.key.toLowerCase()] = false; };
    const blur = () => { keysRef.current = {}; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Render loop: board + hotspots + own character.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = BOARD_W;
    canvas.height = BOARD_H;

    // Proximity-gated click: examine the active (nearby) hotspot if its icon is clicked.
    const onClick = (e) => {
      const ch = charRef.current;
      if (!ch || !inputEnabledRef.current || ch.inCorridor) return;
      const id = activeIdRef.current;
      if (!id) return;
      // CSS px -> canvas px -> WORLD px. This is the only canvas-to-board mapping
      // in the client, so the camera has to be inverted here or clicking a
      // hotspot silently starts missing once the view is zoomed.
      const r = canvas.getBoundingClientRect();
      const vx = (e.clientX - r.left) * (VIEW_W / r.width);
      const vy = (e.clientY - r.top) * (VIEW_H / r.height);
      const cam = camRef.current;
      const { x: ix, y: iy } = cam ? cam.toWorld(vx, vy) : { x: vx, y: vy };
      const rr = roomRect(ch.anchorRoom);
      const h = (ROOM_HOTSPOTS[ch.anchorRoom] || []).find((x) => x.id === id);
      if (!h) return;
      const hx = rr.x + h.x * rr.w, hy = rr.y + h.y * rr.h;
      // The click must land on the icon AND the detective must be within reach
      // (activeId already guarantees reach, so this only gates the pointer).
      if (Math.hypot(hx - ix, hy - iy) <= HOTSPOT_RADIUS) { ch.faceToward(hx, hy); onExamineRef.current?.(id); }
    };
    canvas.addEventListener("click", onClick);

    // Firelight flicker is the only animated lighting; honour reduced motion.
    // Read once — the static light pools stay either way, only the wobble stops.
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

    let raf, last = performance.now();
    const loop = (t) => {
      const dt = Math.min(50, t - last);
      last = t;
      const ch = charRef.current;
      if (ch) {
        const enabled = inputEnabledRef.current;
        const k = enabled ? keysRef.current : {};
        const dx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
        const dy = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0);
        ch.setInput(dx, dy);
        // Shift → 2x, gated with input AND with the host's Sprint setting.
        ch.sprint = enabled && sprintEnabledRef.current && Boolean(k.shift);
        ch.update(dt);
        // Publish the feet position for the manor map, which needs a live dot
        // rather than a room highlight (you can be in the corridor, where there
        // is no room to light up).
        setPlayerPos(ch.x, ch.y, ch.anchorRoom, ch.inCorridor);

        // Footsteps follow the movement state. Character.update() now sets state
        // to "idle" when a wall blocks the step (feet didn't advance), so this is
        // silent against a wall too. The sound module guards against per-frame
        // restarts, so calling these every frame only acts on a real
        // idle↔walk↔sprint transition. Disabled input idles the character too.
        if (!ch.isMoving()) stopFootsteps();
        else if (ch.sprint) playFootstepsSprint();
        else playFootstepsWalk();

        // Nearest UNEXAMINED hotspot in the current room, within reach.
        const room = ch.inCorridor ? null : ch.anchorRoom;
        let activeId = null;
        if (enabled && room) {
          const rr = roomRect(room);
          let best = HOTSPOT_RADIUS;
          for (const h of ROOM_HOTSPOTS[room] || []) {
            if (examinedRef.current.has(h.id)) continue;
            const d = reachOf(room, h.id, ch.x, ch.y);
            if (d < best) { best = d; activeId = h.id; }
          }
        }
        activeIdRef.current = activeId;
        if (import.meta.env.DEV) {
          if (activeId && room) {
            const rr = roomRect(room);
            const hs = (ROOM_HOTSPOTS[room] || []).find((x) => x.id === activeId);
            activeXYRef.current = hs
              ? { id: activeId, x: rr.x + hs.x * rr.w, y: rr.y + hs.y * rr.h }
              : null;
          } else activeXYRef.current = null;
        }

        // Edge-triggered E → turn to face the hotspot, then examine it (once per press).
        const ePressed = enabled && Boolean(keysRef.current.e);
        if (ePressed && !ePrevRef.current && activeId) {
          const rr = roomRect(ch.anchorRoom);
          const h = (ROOM_HOTSPOTS[ch.anchorRoom] || []).find((x) => x.id === activeId);
          if (h) ch.faceToward(rr.x + h.x * rr.w, rr.y + h.y * rr.h);
          onExamineRef.current?.(activeId);
        }
        ePrevRef.current = ePressed;
      }

      const cam = camRef.current;
      const current = ch?.anchorRoom;
      const reachable = showReachableRef.current ? ROOM_IDS.filter((id) => id !== current) : [];

      // ---- 1. SCREEN space: clear -------------------------------------------
      // There was no clearRect here before: the board blit covered the whole
      // canvas and served as the implicit clear. Under a camera that stops being
      // guaranteed, so wipe explicitly (menuScene.js does the same).
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = PALETTE.bg2;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      // ---- 2. WORLD space: the scene ----------------------------------------
      if (ch && cam) cam.update(dt, ch.x, ch.y);
      if (cam) cam.applyTo(ctx);
      drawBoard(ctx, { current: ch?.inCorridor ? null : current, reachable, flicker: !reducedMotion });
      if (ch) {
        ch.draw(ctx);
        // Tall furniture the detective is standing behind is re-blitted over
        // them, so they can walk behind a bookshelf or hearth instead of
        // floating in front of everything.
        if (!ch.inCorridor) {
          drawOccluders(ctx, ch.anchorRoom, ch.x, ch.y);
          // Wall- and ceiling-mounted pieces go over the detective unconditionally,
          // so standing at the knife rack or a bookshelf puts your head behind it
          // instead of your whole body on top of it.
          drawOverhead(ctx, ch.anchorRoom);
        }
      }

      // The hotspot being searched glows in WORLD space — it marks a piece of
      // furniture, so it belongs to the scene and should scale with the camera.
      const sid = searchingIdRef.current;
      let searchHs = null;
      if (ch && sid && !ch.inCorridor) {
        const rr = roomRect(ch.anchorRoom);
        const hs = (ROOM_HOTSPOTS[ch.anchorRoom] || []).find((x) => x.id === sid);
        if (hs) {
          searchHs = { x: rr.x + hs.x * rr.w, y: rr.y + hs.y * rr.h };
          ch.faceToward(searchHs.x, searchHs.y);   // hold the facing for the whole search
          drawExamineGlow(ctx, searchHs.x, searchHs.y);
        }
      }

      // ---- 3. SCREEN space: UI ----------------------------------------------
      // Markers, prompts and bubbles are affordances, not scenery: drawn after
      // the transform is reset they keep a constant on-screen size at any zoom.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const project = cam ? cam.toView : (x, y) => ({ x, y });
      // Hotspot markers go on top of EVERYTHING, including the occluders.
      // They were previously drawn before the character, so the occluder blit
      // painted over them: walking behind the sideboard made its own magnifier
      // vanish, which read as the hotspot disappearing.
      if (ch && !ch.inCorridor) {
        drawHotspots(ctx, ch.anchorRoom, ROOM_HOTSPOTS[ch.anchorRoom] || [], examinedRef.current,
                     activeIdRef.current, showMarkersRef.current, project);
      }
      if (ch && searchHs) {
        const p = project(ch.x, ch.y - 90);
        drawBubble(ctx, p.x, p.y, { dots: true, scale: searchBubbleScale(searchStartRef.current) });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener("click", onClick); stopFootsteps(); };
  }, []);

  return (
    <div className="board-wrap">
      <canvas
        ref={canvasRef}
        className="board-canvas"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}
