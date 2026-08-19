import CluePips from "./CluePips.jsx";

// Left end of the top bar: who you are, where you are, and how far along. Mirrors
// RivalHud on the right, with the clock between them.
export default function PlayerHud({
  name = "Holmes", character = "holmes", color = "#6fd6c4", roomLabel = "—",
  inCorridor = false, lockedIn = false, clueCount = 0, total,
}) {
  return (
    <div className="hud-sec hud-player">
      <span className="hud-avatar" aria-hidden="true">
        <img src={`/assets/${character}/rotations/south.png`} alt="" />
      </span>
      <div className="hp-id">
        <span className="hp-name" style={{ color }}>{name}</span>
        <span className={`hp-room ${inCorridor ? "is-corridor" : ""}`}>
          📍 {inCorridor ? "Corridor" : roomLabel}
        </span>
      </div>
      <CluePips count={clueCount} total={total} color={color} />
      {/* Kept as its own badge rather than folded into the status line: after
          lock-in you can still WALK, so "locked in" is about your actions, not
          about you being finished. */}
      {lockedIn && <span className="hp-locked" title="Awaiting your rival's accusation">LOCKED IN ✓</span>}
    </div>
  );
}
