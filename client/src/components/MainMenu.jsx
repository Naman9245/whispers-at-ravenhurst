import { useState, useEffect, useRef } from "react";
import { playNotebookOpen } from "../game/sound.js";
import DeskPanel from "./DeskPanel.jsx";
import CaseFilesPanel from "./CaseFilesPanel.jsx";

// Cinematic main menu (Phase 2.7) — the first thing a player sees: a
// typewriter title, a random tagline, and three case-file-style entries.
// The idle-mansion backdrop is NOT rendered here — App mounts a shared
// <MenuBackdrop/> that stays alive across menu ⇄ lobby, so "Begin
// Investigation" just fades the CONTENT out (~300ms) before handing off to the
// EXISTING lobby via onBegin — same scene, new foreground. The buttons use the
// standard UI click (creaks are ambient-only, reserved for the random in-game
// scheduler). Rain + creaks are owned by App (its `ambient` / `inGame` effects).

export const TAGLINES = [
  "Only one detective uncovers the truth.",
  "Every room remembers.",
  "Trust the evidence. Not the people.",
  "Someone is lying.",
  "Every clue changes the story.",
];

const TITLE_1 = "WHISPERS AT";
const TITLE_2 = "RAVENHURST";
const TITLE_LEN = TITLE_1.length + TITLE_2.length;
const TYPE_MS = 35;          // per character → full title in ~0.8s

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

export default function MainMenu({ onBegin, soundOn, onToggleSound }) {
  const leaveTimer = useRef(null);
  const [chars, setChars] = useState(() => (reducedMotion() ? TITLE_LEN : 0));
  const [tagline] = useState(() => TAGLINES[(Math.random() * TAGLINES.length) | 0]);
  const [panel, setPanel] = useState(null);      // null | "desk" | "files"
  const [leaving, setLeaving] = useState(false); // Begin clicked → content fades out

  // Typewriter title (~0.8s). Reduced motion starts complete (chars init).
  useEffect(() => {
    if (chars >= TITLE_LEN) return;
    const id = setInterval(() => setChars((c) => Math.min(TITLE_LEN, c + 1)), TYPE_MS);
    return () => clearInterval(id);
  }, [chars >= TITLE_LEN]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc closes an open panel.
  useEffect(() => {
    if (!panel) return;
    const onKey = (e) => { if (e.key === "Escape") setPanel(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  // Clear a pending leave timeout if we unmount mid-fade.
  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  const begin = () => {
    if (leaving) return;               // double-click guard
    setLeaving(true);
    // Content-only fade (the shared backdrop keeps running underneath — NO cut
    // to black; the lobby panel takes over the same scene). The button's own
    // click sound comes from App's delegated listener (no data-sound="off").
    leaveTimer.current = setTimeout(onBegin, reducedMotion() ? 0 : 300);
  };

  const line1 = TITLE_1.slice(0, chars);
  const line2 = TITLE_2.slice(0, Math.max(0, chars - TITLE_1.length));
  const typing = chars < TITLE_LEN;

  return (
    <div className="main-menu">
      <div className={`mm-content ${leaving ? "leaving" : ""}`}>
        <div className="lobby-title mm-title" aria-label={`${TITLE_1} ${TITLE_2}`}>
          <span>{line1}{typing && chars <= TITLE_1.length && <span className="mm-caret" />}</span>
          <span>{line2}{typing && chars > TITLE_1.length && <span className="mm-caret" />}</span>
        </div>
        <p className="mm-tagline">{tagline}</p>

        <div className="mm-actions">
          <button className="mm-btn" onMouseEnter={() => playNotebookOpen()} onClick={begin}>
            <span className="mm-btn-icon">▶</span> Begin Investigation
          </button>
          <button className="mm-btn" onMouseEnter={() => playNotebookOpen()} onClick={() => setPanel("desk")}>
            <span className="mm-btn-icon">⚙</span> Detective&apos;s Desk
          </button>
          <button className="mm-btn" onMouseEnter={() => playNotebookOpen()} onClick={() => setPanel("files")}>
            <span className="mm-btn-icon">📖</span> Case Files
          </button>
        </div>
      </div>

      {panel === "desk" && (
        <DeskPanel soundOn={soundOn} onToggleSound={onToggleSound} onClose={() => setPanel(null)} />
      )}
      {panel === "files" && <CaseFilesPanel onClose={() => setPanel(null)} />}
    </div>
  );
}
