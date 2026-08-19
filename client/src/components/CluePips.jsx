import { PROGRESS_TOTAL } from "@shared/constants.js";

// One detective's progress, as filled pips plus the raw count.
//
// Pips read at a glance — the point of the new top bar is that you can see the
// gap between you and your rival without parsing two numbers — but they are
// genuinely hard to COUNT past about five, so the "n/7" stays alongside. It is
// also what several e2e suites assert on (`.ct-count`).
//
// `count` of null means the host chose "Rival progress: Hidden". The number is
// withheld by the server, not by this component; all it can do is render the gap
// honestly rather than implying zero.
export default function CluePips({ count, total = PROGRESS_TOTAL, color = "#f0b040", hidden = false }) {
  const n = hidden || count == null ? 0 : Math.min(count, total);
  return (
    <span className="clue-pips" title={hidden ? "Rival progress is hidden in this game" : `${n} of ${total} clues found`}>
      <span className="cp-dots">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`cp-dot ${!hidden && i < n ? "on" : ""}`}
            style={!hidden && i < n ? { background: color, boxShadow: `0 0 5px ${color}` } : undefined}
          />
        ))}
      </span>
      <span className="ct-count" style={{ color }}>{hidden || count == null ? "—" : `${n}/${total}`}</span>
    </span>
  );
}
