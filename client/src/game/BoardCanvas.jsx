import { useRef, useEffect } from "react";
import { drawBoard } from "./drawBoard.js";
import { BOARD_W, BOARD_H, ROOM_IDS } from "./boardData.js";
import { loadSprites } from "./sprites.js";
import { Character } from "./Character.js";

/**
 * Renders the mansion and THIS client's own character (privacy: never the
 * opponent). Movement is free-roam: WASD / arrow keys drive an input vector,
 * the Character walks with collision, and on entering a new room (or the
 * corridor) it calls onRegionChange so the parent can tell the server.
 *
 * Props: me, startRoom, showReachable, inputEnabled, onRegionChange(room, inCorridor)
 */
export default function BoardCanvas({ me = "holmes", startRoom = "study", showReachable = false, inputEnabled = true, onRegionChange }) {
  const canvasRef = useRef(null);
  const charRef = useRef(null);
  const keysRef = useRef({});
  const showReachableRef = useRef(showReachable);
  const inputEnabledRef = useRef(inputEnabled);
  const regionCbRef = useRef(onRegionChange);
  showReachableRef.current = showReachable;
  inputEnabledRef.current = inputEnabled;
  regionCbRef.current = onRegionChange;

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

  // Keyboard input (WASD + arrows). Tracked globally; ignored when input disabled.
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

  // Render loop: board + own character, driven by the current input vector.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = BOARD_W;
    canvas.height = BOARD_H;
    let raf, last = performance.now();
    const loop = (t) => {
      const dt = Math.min(50, t - last);
      last = t;
      const ch = charRef.current;
      if (ch) {
        const k = inputEnabledRef.current ? keysRef.current : {};
        const dx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
        const dy = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0);
        ch.setInput(dx, dy);
        ch.update(dt);
      }
      const current = ch?.anchorRoom;
      // Every room is reachable via the corridor, so MOVE highlights them all.
      const reachable = showReachableRef.current ? ROOM_IDS.filter((id) => id !== current) : [];
      drawBoard(ctx, { current: ch?.inCorridor ? null : current, reachable });
      if (ch) ch.draw(ctx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
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
