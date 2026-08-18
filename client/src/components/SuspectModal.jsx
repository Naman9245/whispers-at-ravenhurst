import { useState, useEffect } from "react";
import { questionsFor, isFreeQuestion, CATEGORY_LABEL, QUESTION_CATEGORIES } from "@shared/suspectQuestions.js";
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
  const qState = (selectedId && questioning[selectedId]) || { asked: 0, askedIds: [], reAskable: [], confronted: [] };
  const log = (selectedId && dialogues[selectedId]) || [];
  const outOfQuestions = qState.asked >= QUESTION_CAP;
  const unusedClues = foundClues.filter((c) => !qState.confronted.includes(c.id));

  // Questions available to THIS suspect: the shared core plus their own set.
  // A clue-gated question is HIDDEN until its clue is found — showing it greyed
  // would leak the clue's contents, since the question text quotes the evidence.
  const foundIds = new Set(foundClues.map((c) => c.id));
  const askedIds = new Set(qState.askedIds || []);
  // A question whose story has collapsed since you asked it can be put again,
  // once, for free — otherwise a player who asked before finding the
  // contradicting evidence could never hear the suspect change their answer.
  const reAskable = new Set(qState.reAskable || []);
  const available = selectedId
    ? questionsFor(selectedId).filter((q) => !q.requiresClue || foundIds.has(q.requiresClue))
    : [];
  // Core questions spend the budget; clue-unlocked ones are free, so they stay
  // askable even once the budget is gone.
  const askable = (q) => reAskable.has(q.id) || (!askedIds.has(q.id) && (isFreeQuestion(q) || !outOfQuestions));
  const grouped = QUESTION_CATEGORIES
    .map((cat) => ({ cat, items: available.filter((q) => q.category === cat) }))
    .filter((g) => g.items.length > 0);


  // Drop focus from whatever opened this modal (the ACCUSE / QUESTION pill keeps
  // DOM focus behind the overlay). Without this, closing with Esc and then
  // pressing Enter re-activates that still-focused button and re-opens the modal.
  useEffect(() => { document.activeElement?.blur?.(); }, []);

  // Enter / Esc close the modal, matching ExamineModal and the in-game help.
  // Listener lives only while this modal is mounted; BoardCanvas movement input
  // is already suppressed for the duration (App's modalOpen → inputEnabled).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); onClose?.(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

            <div className="question-list">
              <div className="ql-head">
                Ask ({qState.asked}/{QUESTION_CAP})
                {outOfQuestions && <span className="ql-spent"> — find evidence to press further</span>}
              </div>
              {grouped.map(({ cat, items }) => (
                <div key={cat} className="ql-group">
                  <div className="ql-cat">{CATEGORY_LABEL[cat] || cat}</div>
                  {items.map((q) => {
                    const again = reAskable.has(q.id);
                    const done = askedIds.has(q.id) && !again;
                    const free = isFreeQuestion(q) || again;
                    return (
                      <button
                        key={q.id}
                        className={`ql-btn ${done ? "asked" : ""} ${free ? "free" : ""}`}
                        disabled={!askable(q)}
                        title={again ? "Their story has changed — put it to them again" : free ? "Unlocked by evidence you found — free to ask" : undefined}
                        onClick={() => onAsk(selected.id, q.id, q.text)}
                      >
                        {free && <span className="ql-key">🔑</span>}
                        {q.text}
                        {again && <span className="ql-again"> — press them again</span>}
                        {done && <span className="ql-done">✓</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

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
