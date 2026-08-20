import { useEffect, useRef, useState } from "react";
import { drawMiniMap } from "../game/drawBoard.js";
import { getPlayerPos } from "../game/playerPos.js";
import { ROOMS } from "../game/boardData.js";

// The manor map, hidden until asked for (M, Esc, or the top-bar button) — the
// same shape Among Us uses. It is a thing you stop and check, not permanent
// screen furniture, so it costs the board nothing while it's closed.
//
// Compact by design: a small panel over the game view, never full width.
//
// It DOES animate: the "you are here" dot is drawn at the detective's actual feet
// and follows them while the map is open, so it stays right in the corridor and
// on the way between rooms. So there is a rAF here — but only while open, and it
// reads a module store rather than React state, because a dot that moved through
// setState would re-render the whole game tree sixty times a second.
const MAP_W = 440;
const MAP_H = 257;   // 440 * (860 / 1472), the board's aspect

export default function MapOverlay({ open, roomLabel, examined = [], onClose }) {
  const canvasRef = useRef(null);
  const examinedRef = useRef(new Set(examined));
  examinedRef.current = new Set(examined);
  // Only for the caption under the map. Updated on a 250ms tick rather than per
  // frame: it changes when you cross a doorway, not sixty times a second.
  const [where, setWhere] = useState(null);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const c = canvas?.getContext("2d");
    if (!c) return;

    let raf;
    const frame = () => {
      drawMiniMap(c, MAP_W, MAP_H, { examined: examinedRef.current, player: getPlayerPos() });
      raf = requestAnimationFrame(frame);
    };
    frame();

    const label = setInterval(() => {
      const p = getPlayerPos();
      setWhere({ room: p.room, inCorridor: p.inCorridor });
    }, 250);
    setWhere({ room: getPlayerPos().room, inCorridor: getPlayerPos().inCorridor });

    return () => { cancelAnimationFrame(raf); clearInterval(label); };
  }, [open]);

  if (!open) return null;

  // Read the caption off the LIVE position, not off a prop the parent captured
  // when the map opened — that was what kept saying "the Kitchen" after you had
  // walked out of it.
  const inCorridor = where?.inCorridor ?? true;
  const here = where?.room ? (ROOMS[where.room]?.label || roomLabel || where.room) : null;

  return (
    <div className="map-scrim" onClick={onClose}>
      <div className="map-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="map-head">
          <span className="map-title">MANOR MAP</span>
          <span className="map-hint">M or Esc to close</span>
        </div>
        <canvas ref={canvasRef} width={MAP_W} height={MAP_H} className="map-canvas" />
        <div className="map-foot">
          {inCorridor || !here
            ? <>You are in the <b>corridor</b></>
            : <>You are in the <b>{here}</b></>}
          <em className="map-legend">Filled dots = places you've searched</em>
        </div>
      </div>
    </div>
  );
}
