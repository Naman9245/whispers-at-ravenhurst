// Left segment of the cohesive HUD bar: who you are and where you are, on one
// compact line. A "LOCKED IN ✓" badge appears once you've submitted your
// accusation (you can still watch, but can no longer act).
export default function PlayerHud({
  name = "Holmes",
  color = "#6fd6c4",
  roomLabel = "—",
  inCorridor = false,
  lockedIn = false,
}) {
  return (
    <div className="hud-sec hud-player">
      <span className="hp-dot" style={{ background: color }} />
      <span className="hp-you">YOU:</span>
      <b className="hp-name" style={{ color }}>{name}</b>
      <span className="hp-sep">·</span>
      <span className={`hp-room ${inCorridor ? "is-corridor" : ""}`}>
        📍 {inCorridor ? "Corridor" : roomLabel}
      </span>
      {lockedIn && <span className="hp-locked" title="Awaiting opponent's accusation">LOCKED IN ✓</span>}
    </div>
  );
}
