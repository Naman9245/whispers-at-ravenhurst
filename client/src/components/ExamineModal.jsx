import { useEffect } from "react";

// Small centered modal shown when the player examines a hotspot. Reveals the clue
// found there (text + tag) or "Nothing of interest here." Auto-closes after 5s,
// or on click. Reuses the shared .modal-backdrop chrome.
const TAG_LABEL = { physical_evidence: "Physical Evidence", testimony: "Testimony", document: "Document" };

export default function ExamineModal({ result, onClose }) {

  // Drop focus from whatever opened this modal (the ACCUSE / QUESTION pill keeps
  // DOM focus behind the overlay). Without this, closing with Esc and then
  // pressing Enter re-activates that still-focused button and re-opens the modal.
  useEffect(() => { document.activeElement?.blur?.(); }, []);

  // Auto-close after 5s.
  useEffect(() => {
    const t = setTimeout(() => onClose?.(), 5000);
    return () => clearTimeout(t);
  }, [result, onClose]);

  // Enter / Esc close the modal (so keyboard players never reach for the mouse).
  // Listener lives only while the modal is mounted; movement input resumes on its
  // own once this unmounts (BoardCanvas listens on window, not the canvas element).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
