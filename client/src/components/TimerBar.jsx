// Centre section of the HUD bar: the game clock. Calm teal/green for almost the
// whole game; in the final minute (time-left-to-act ≤ 1:00) it turns red and
// pulses. No tiers, no banners — the red timer + screen-edge glow carry the
// urgency, paired with a single 3-second tick burst fired from App at the 1:00 mark.
function fmt(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export default function TimerBar({ accusation, serverNow }) {
  const acc = accusation;
  if (!acc?.startedAt) return null;

  const endAt = acc.finalDeadline || acc.startedAt + acc.softMs;
  const endMsLeft = Math.max(0, endAt - serverNow);
  const urgent = endMsLeft > 0 && endMsLeft <= 60_000;

  let phase, remaining;
  if (acc.finalDeadline) {
    phase = "FINAL WINDOW";
    remaining = endMsLeft;
  } else if (serverNow < acc.opensAt) {
    phase = "INVESTIGATION";
    remaining = Math.max(0, acc.opensAt - serverNow);
  } else {
    phase = "ACCUSE WINDOW";
    remaining = endMsLeft;
  }

  return (
    <div className={`hud-sec hud-timer ${urgent ? "urgent" : ""}`}>
      <div className="tb-phase">{phase}</div>
      <div className="tb-time">{fmt(remaining)}</div>
    </div>
  );
}
