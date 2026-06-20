import { useEffect } from "react";

// Small centered modal shown when the player examines a hotspot. Reveals the clue
// found there (text + tag) or "Nothing of interest here." Auto-closes after 5s,
// or on click. Reuses the shared .modal-backdrop chrome.
const TAG_LABEL = { physical_evidence: "Physical Evidence", testimony: "Testimony", document: "Document" };

export default function ExamineModal({ result, onClose }) {
  useEffect(() => {
    const t = setTimeout(() => onClose?.(), 5000);
    return () => clearTimeout(t);
  }, [result, onClose]);

  if (!result) return null;
  const { hotspotName, found, clue } = result;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="examine-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="examine-title">You examine {hotspotName}…</div>
        <p className="examine-atmos">
          {found ? "Something here catches your eye." : "You search every inch, but…"}
        </p>
        {found ? (
          <div className="examine-clue">
            <span className="nb-tag">{TAG_LABEL[clue.tag] || clue.tag}</span>
            <p className="examine-clue-text">{clue.text}</p>
          </div>
        ) : (
          <p className="examine-empty">Nothing of interest here.</p>
        )}
        <button className="examine-ok" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
