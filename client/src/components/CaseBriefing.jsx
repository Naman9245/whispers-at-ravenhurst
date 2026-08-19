import { useEffect, useState } from "react";
import CaseBriefingBody from "./CaseBriefingBody.jsx";

// The case file, shown once between the lobby and the board.
//
// The clock is ALREADY RUNNING behind this screen: the server starts the game the
// moment the second player joins, and gating that on both detectives acknowledging
// a briefing would mean a new intent, a both-ready gate and a stall path if one of
// them wanders off — a real protocol change for a screen that is pure ceremony. So
// it says so plainly, shows the elapsed count, and dismisses itself after 45s
// rather than letting an idle player lose the game to a modal. Both detectives see
// it at the same moment, so it costs them the same.
const AUTO_DISMISS_MS = 45_000;

export default function CaseBriefing({ caseInfo, settings, onBegin }) {
  const [left, setLeft] = useState(Math.ceil(AUTO_DISMISS_MS / 1000));

  useEffect(() => {
    const id = setInterval(() => setLeft((s) => s - 1), 1000);
    const done = setTimeout(() => onBegin?.(), AUTO_DISMISS_MS);
    return () => { clearInterval(id); clearTimeout(done); };
  }, [onBegin]);

  return (
    <div className="briefing-screen">
      <div className="briefing-card">
        <div className="briefing-head">
          <span className="briefing-case">CASE Nº {caseInfo?.caseId || "—"}</span>
          <span className="briefing-clock">The clock is already running · {Math.max(0, left)}s</span>
        </div>

        <h1 className="briefing-title">The Ravenhurst Case</h1>

        <CaseBriefingBody caseInfo={caseInfo} settings={settings} />

        {/* Deliberately NOT "Begin Investigation" — that exact string is the main
            menu's button, and every e2e helper matches button text across the
            whole page. */}
        <button className="lb-btn primary briefing-go" onClick={onBegin}>Enter the Manor</button>
      </div>
    </div>
  );
}
