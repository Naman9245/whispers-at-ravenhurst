import { useRef, useEffect } from "react";
import { drawBoard, drawHotspots, drawSearching } from "./drawBoard.js";
import { BOARD_W, BOARD_H, ROOM_IDS, roomRect } from "./boardData.js";
import { ROOM_HOTSPOTS } from "@shared/roomHotspots.js";
import { loadSprites } from "./sprites.js";
import { Character } from "./Character.js";

const HOTSPOT_RADIUS = 48; // how close the feet must be to examine a hotspot

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
  examined = [], searchingId = null, onExamine, onRegionChange,
}) {
  const canvasRef = useRef(null);
  const charRef = useRef(null);
  const keysRef = useRef({});
  const showReachableRef = useRef(showReachable);
  const inputEnabledRef = useRef(inputEnabled);
  const regionCbRef = useRef(onRegionChange);
  const examinedRef = useRef(new Set());
  const onExamineRef = useRef(onExamine);
  const activeIdRef = useRef(null);
  const ePrevRef = useRef(false);
  const searchingIdRef = useRef(null);
  showReachableRef.current = showReachable;
  inputEnabledRef.current = inputEnabled;
  regionCbRef.current = onRegionChange;
  examinedRef.current = new Set(examined);
  onExamineRef.current = onExamine;
  searchingIdRef.current = searchingId;

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
        // Dev-only handle for end-to-end movement tests (stripped from prod builds).
        if (import.meta.env.DEV) window.__wrChar = ch;
      }
    });
    return () => { alive = false; };
  }, [me, startRoom]);

  // Keyboard input (WASD + arrows + E). Tracked globally; ignored when disabled.
  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
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
      const r = canvas.getBoundingClientRect();
      const ix = (e.clientX - r.left) * (BOARD_W / r.width);
      const iy = (e.clientY - r.top) * (BOARD_H / r.height);
      const rr = roomRect(ch.anchorRoom);
      const h = (ROOM_HOTSPOTS[ch.anchorRoom] || []).find((x) => x.id === id);
      if (!h) return;
      const hx = rr.x + h.x * rr.w, hy = rr.y + h.y * rr.h;
      if (Math.hypot(hx - ix, hy - iy) <= 26) onExamineRef.current?.(id);
    };
    canvas.addEventListener("click", onClick);

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
        ch.sprint = enabled && Boolean(k.shift); // Shift → 2x; gated with input
        ch.update(dt);

        // Nearest UNEXAMINED hotspot in the current room, within reach.
        const room = ch.inCorridor ? null : ch.anchorRoom;
        let activeId = null;
        if (enabled && room) {
          const rr = roomRect(room);
          let best = HOTSPOT_RADIUS;
          for (const h of ROOM_HOTSPOTS[room] || []) {
            if (examinedRef.current.has(h.id)) continue;
            const d = Math.hypot(rr.x + h.x * rr.w - ch.x, rr.y + h.y * rr.h - ch.y);
            if (d < best) { best = d; activeId = h.id; }
          }
        }
        activeIdRef.current = activeId;

        // Edge-triggered E → examine the active hotspot once per press.
        const ePressed = enabled && Boolean(keysRef.current.e);
        if (ePressed && !ePrevRef.current && activeId) onExamineRef.current?.(activeId);
        ePrevRef.current = ePressed;
      }

      const current = ch?.anchorRoom;
      const reachable = showReachableRef.current ? ROOM_IDS.filter((id) => id !== current) : [];
      drawBoard(ctx, { current: ch?.inCorridor ? null : current, reachable });
      if (ch && !ch.inCorridor) {
        drawHotspots(ctx, ch.anchorRoom, ROOM_HOTSPOTS[ch.anchorRoom] || [], examinedRef.current, activeIdRef.current);
      }
      if (ch) ch.draw(ctx);
      // Searching overlay (drawn over the character so the bubble reads clearly).
      const sid = searchingIdRef.current;
      if (ch && sid && !ch.inCorridor) {
        const rr = roomRect(ch.anchorRoom);
        const hs = (ROOM_HOTSPOTS[ch.anchorRoom] || []).find((x) => x.id === sid);
        if (hs) drawSearching(ctx, ch.x, ch.y, rr.x + hs.x * rr.w, rr.y + hs.y * rr.h);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener("click", onClick); };
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
