import { useState } from "react";
import { QUESTION_POOL } from "@shared/questions.js";
import { QUESTION_CAP } from "@shared/constants.js";

// Global suspect-questioning modal. Opened from the QUESTION SUSPECT action; the
// player picks a suspect, then asks up to QUESTION_CAP generic questions and/or
// confronts them with found evidence. All dialogue shown here comes one branch
// at a time from the server — the full tree never reaches the client.

const PORTRAIT_COLORS = ["#7a3a8c", "#c79a3a", "#b03a4a", "#3a5ab0", "#3a8c4a", "#9a6a3a"];

export default function SuspectModal({ caseInfo, foundClues = [], questioning = {}, dialogues = {}, onAsk, onConfront, onClose }) {
  const suspects = caseInfo?.suspects || [];
  const [selectedId, setSelectedId] = useState(null);
  const [confrontOpen, setConfrontOpen] = useState(false);

  const selected = suspects.find((s) => s.id === selectedId);
  const selectedIdx = suspects.findIndex((s) => s.id === selectedId);
  const qState = (selectedId && questioning[selectedId]) || { asked: 0, confronted: [] };
  const log = (selectedId && dialogues[selectedId]) || [];
  const outOfQuestions = qState.asked >= QUESTION_CAP;
  const unusedClues = foundClues.filter((c) => !qState.confronted.includes(c.id));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="suspect-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        {!selected ? (
          <>
            <h2 className="modal-title">Question a Suspect</h2>
            <p className="modal-sub">Six remain under this roof. Choose whom to press.</p>
            <div className="suspect-grid">
              {suspects.map((s, i) => {
                const asked = questioning[s.id]?.asked || 0;
                return (
                  <button key={s.id} className="suspect-card" onClick={() => setSelectedId(s.id)}>
                    <div className="suspect-portrait" style={{ background: PORTRAIT_COLORS[i % 6] }}>S{i + 1}</div>
                    <span className="suspect-name">{s.name}</span>
                    <span className="suspect-role">{s.role}</span>
                    <span className="suspect-budget">{asked}/{QUESTION_CAP} asked</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <button className="modal-back" onClick={() => { setSelectedId(null); setConfrontOpen(false); }}>‹ All suspects</button>
            <div className="suspect-head">
              <div className="suspect-portrait lg" style={{ background: PORTRAIT_COLORS[selectedIdx % 6] }}>S{selectedIdx + 1}</div>
              <div>
                <div className="suspect-name lg">{selected.name}</div>
                <div className="suspect-role">{selected.role}</div>
                <div className="suspect-blurb">{selected.blurb}</div>
              </div>
            </div>

            <div className="dialogue-log">
              {log.length === 0 && <p className="dialogue-empty">No words exchanged yet. Put a question to them.</p>}
              {log.map((entry, i) => (
                <div key={i} className="dialogue-entry">
                  <div className="dl-q">{entry.q}</div>
                  <div className="dl-a">
                    {entry.a}
                    {entry.tell && <span className="dl-tell"> {entry.tell}</span>}
                  </div>
                </div>
              ))}
            </div>

            {outOfQuestions ? (
              <div className="no-more-questions">NO MORE QUESTIONS</div>
            ) : (
              <div className="question-list">
                <div className="ql-head">Ask ({qState.asked}/{QUESTION_CAP})</div>
                {QUESTION_POOL.map((q) => (
                  <button key={q.id} className="ql-btn" onClick={() => onAsk(selected.id, q.id, q.text)}>
                    {q.text}
                  </button>
                ))}
              </div>
            )}

            <div className="confront-section">
              <button className="confront-toggle" disabled={unusedClues.length === 0} onClick={() => setConfrontOpen((v) => !v)}>
                Confront with evidence {unusedClues.length === 0 ? "(no unused clues)" : `(${unusedClues.length})`}
              </button>
              {confrontOpen && unusedClues.length > 0 && (
                <ul className="confront-list">
                  {unusedClues.map((c) => (
                    <li key={c.id}>
                      <button className="confront-clue" onClick={() => { onConfront(selected.id, c.id, c.text); setConfrontOpen(false); }}>
                        {c.text}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
