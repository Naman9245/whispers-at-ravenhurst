import { useEffect, useRef } from "react";
import { drawMiniMap } from "../game/drawBoard.js";

// The manor map, hidden until asked for (M, Esc, or the top-bar button) — the
// same shape Among Us uses. It is a thing you stop and check, not permanent
// screen furniture, so it costs the board nothing while it's closed.
//
// Compact by design: a small panel over the game view, never full width.
//
// No rAF here. Nothing on the map animates, so it is painted once per open (and
// again when the room or the examined set changes) rather than joining the
// gameplay loop.
const MAP_W = 440;
const MAP_H = 257;   // 440 * (860 / 1472), the board's aspect

export default function MapOverlay({ open, room, roomLabel, inCorridor = false, examined = [], onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current?.getContext("2d");
    if (c) drawMiniMap(c, MAP_W, MAP_H, room, { examined: new Set(examined) });
  }, [open, room, examined]);

  if (!open) return null;

  return (
    <div className="map-scrim" onClick={onClose}>
      <div className="map-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="map-head">
          <span className="map-title">MANOR MAP</span>
          <span className="map-hint">M or Esc to close</span>
        </div>
        <canvas ref={canvasRef} width={MAP_W} height={MAP_H} className="map-canvas" />
        <div className="map-foot">
          {inCorridor || !room
            ? "You are in the corridor"
            : <>You are in the <b>{roomLabel || room}</b></>}
          <em className="map-legend">Filled dots = places you've searched</em>
        </div>
      </div>
    </div>
  );
}
