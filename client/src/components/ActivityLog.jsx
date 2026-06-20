import { useEffect, useRef } from "react";

// Slide-in activity log (replaces the always-on chat box). Opens from the LEFT as
// a compact mini-font list of the last few events, and auto-closes after 5s of no
// interaction. Hard-capped in size (contain: layout size + a fixed box + an inner
// scroll area) so it can NEVER grow, no matter how many messages arrive.
const MAX_SHOWN = 10;
const AUTO_CLOSE_MS = 5000;
const MAX_CHARS = 60;

// "is examining something…" → "examining something…"; hard-truncate at 60 chars.
function compact(text = "") {
  let t = String(text).replace(/^is\s+/i, "").trim();
  if (t.length > MAX_CHARS) t = t.slice(0, MAX_CHARS - 1).trimEnd() + "…";
  return t;
}

export default function ActivityLog({ open, lines = [], onClose }) {
  const timer = useRef(null);
  const arm = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onClose?.(), AUTO_CLOSE_MS);
  };
  // (Re)arm the 5s auto-close on open and whenever a new line arrives while open.
  useEffect(() => {
    if (!open) return;
    arm();
    return () => clearTimeout(timer.current);
  }, [open, lines.length]);

  if (!open) return null;
  const shown = lines.slice(-MAX_SHOWN);
  return (
    <>
      {/* transparent scrim: a click anywhere outside closes; board stays visible */}
      <div className="panel-scrim" onClick={onClose} />
      <aside className="activity-panel" onMouseMove={arm} onClick={arm} role="log" aria-label="Activity log">
        <div className="panel-head">
          <span>ACTIVITY</span>
          <button className="panel-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <ul className="activity-list">
          {shown.length === 0 && <li className="activity-empty">No activity yet.</li>}
          {shown.map((l, i) => (
            <li key={i} className={`activity-line ${l.kind || "ambient"}`}>
              <span className="al-who" style={{ color: l.color }}>[{l.who}]</span>{" "}
              <span className="al-text">{compact(l.text)}</span>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
