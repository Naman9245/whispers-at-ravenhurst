import { useState } from "react";
import { suspectChip } from "./suspectStyle.js";

const NEXT = { unknown: "suspected", suspected: "cleared", cleared: "unknown" };

// One suspect in the right-hand rail. The face carries your working theory; the
// back carries the dossier.
//
// Two behaviours, two targets. Clicking the card body cycles your mark
// (unknown → suspected → cleared) exactly as the notebook row used to; flipping
// is its own corner button. Putting both on the card would mean every attempt to
// mark someone risked flipping them instead.
//
// The bio is FLAVOUR ONLY and says so on the card. validateCase() proves a case is
// solvable from `clue.eliminates` alone and knows nothing about these fields, so a
// player who treats "5'3\", stout" as evidence is reasoning about something the
// game never promised — the note is there to stop that being a trap.
export default function SuspectCard({ suspect, index, status = "unknown", onCycle, onQuestion }) {
  const [flipped, setFlipped] = useState(false);
  const chip = suspectChip(index);
  const bio = [
    ["Age", suspect.age],
    ["Height", suspect.height],
    ["Build", suspect.build],
    ["Occupation", suspect.occupation],
  ].filter(([, v]) => v != null && v !== "");

  return (
    <div className={`sus-card ${flipped ? "flipped" : ""} status-${status}`}>
      <div className="sus-inner">
        <div
          className="sus-face sus-front"
          role="button"
          tabIndex={0}
          title="Click to mark: suspected → cleared → unknown"
          onClick={() => onCycle?.(suspect.id, NEXT[status] || "suspected")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCycle?.(suspect.id, NEXT[status] || "suspected"); } }}
        >
          <span className="sus-chip" style={{ background: chip.color }}>{chip.label}</span>
          <span className="sus-name">{suspect.name}</span>
          <span className="sus-role">{suspect.role}</span>
          <span className="sus-blurb">{suspect.blurb}</span>
          {status !== "unknown" && <span className={`sus-mark ${status}`}>{status}</span>}
        </div>

        <div className="sus-face sus-back">
          <span className="sus-name">{suspect.name}</span>
          {bio.length ? (
            <dl className="sus-bio">
              {bio.map(([k, v]) => (
                <div className="sus-bio-row" key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          ) : (
            <span className="sus-blurb">No dossier on file.</span>
          )}
          <span className="sus-flavour">Background detail only — none of this clears or condemns anyone.</span>
          {onQuestion && (
            <button className="sus-question" onClick={() => onQuestion(suspect.id)}>Question</button>
          )}
        </div>
      </div>

      <button
        className="sus-flip"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? `Show ${suspect.name}'s summary` : `Show ${suspect.name}'s dossier`}
        title={flipped ? "Back to the summary" : "Show the dossier"}
      >⟳</button>
    </div>
  );
}
