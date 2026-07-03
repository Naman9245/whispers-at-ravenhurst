import { useEffect, useRef } from "react";
import { startMenuScene } from "../game/menuScene.js";
import { BOARD_W, BOARD_H } from "../game/boardData.js";

// The animated idle-mansion backdrop shared by EVERY pre-game screen (main
// menu AND lobby, plus the panels layered over them). App mounts it ONCE in
// the pre-game wrapper and keeps it alive across menu ⇄ lobby transitions —
// the scene (camera drift, room pulses, ghost detectives) never resets when
// the foreground swaps. It unmounts only when a real game starts (view
// arrives) or the reveal shows.
export default function MenuBackdrop() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    return startMenuScene(canvasRef.current, { reducedMotion: reduced });   // stop() on unmount
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="mm-canvas" width={BOARD_W} height={BOARD_H} aria-hidden="true" />
      <div className="mm-scrim" aria-hidden="true" />
    </>
  );
}
