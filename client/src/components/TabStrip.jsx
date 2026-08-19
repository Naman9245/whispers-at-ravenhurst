import CaseBriefingBody from "./CaseBriefingBody.jsx";

// The strip under the board: Scenario · Questions · Log.
//
// Collapsed by default, and that is load-bearing rather than tidy — the board is
// the hero, and a strip that opened on arrival would eat a third of it before the
// player had asked for anything. Clicking a tab expands a panel beneath, clicking
// the same tab again closes it.
//
// The panel is height-capped with `contain: layout size` for the same reason the
// activity log is: the Log tab holds an unbounded chat feed, and without the cap a
// long game grows the strip and shrinks the board.
const TABS = [
  { key: "scenario", label: "Scenario" },
  { key: "questions", label: "Questions" },
  { key: "log", label: "Log" },
];

export default function TabStrip({ open, onToggle, caseInfo, settings, lines = [], askedCount = 0, questionCap = 0 }) {
  return (
    <div className="tab-strip">
      <div className="ts-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`ts-tab ${open === t.key ? "active" : ""}`}
            onClick={() => onToggle(open === t.key ? null : t.key)}
          >
            {t.label}
          </button>
        ))}
        <span className="ts-case">CASE Nº {caseInfo?.caseId || "—"}</span>
      </div>

      {open && (
        <div className="ts-panel">
          {open === "scenario" && <CaseBriefingBody caseInfo={caseInfo} settings={settings} compact />}

          {open === "questions" && (
            <div className="ts-questions">
              <p className="ts-hint">
                Walk up to furniture and press <b>E</b> to search it. Put questions to the
                suspects from their cards on the right — you have <b>{questionCap}</b> core
                questions each, and anything a clue unlocks is free.
              </p>
              <p className="ts-hint">Questions put so far: <b>{askedCount}</b></p>
            </div>
          )}

          {open === "log" && (
            <ul className="ts-log">
              {lines.length === 0 && <li className="ts-log-empty">Nothing has happened yet.</li>}
              {lines.slice(-40).map((l, i) => (
                <li key={i} className={`activity-line ${l.kind || "ambient"}`}>
                  <span className="al-who" style={{ color: l.color }}>{l.who}</span>
                  <span className="al-text">{l.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
