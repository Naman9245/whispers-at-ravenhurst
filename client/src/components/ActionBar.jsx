// Compact pill action cluster directly under the HUD. Always-available (no turns);
// emits the action key. MOVE toggles the reachable overlay; the rest route through
// App. Once the player has LOCKED IN, every action is disabled (grayed, no layout
// shift) and ACCUSE reads "LOCKED IN ✓".
const ACTIONS = [
  { key: "MOVE", label: "MOVE" },
  { key: "INVESTIGATE", label: "INVESTIGATE" },
  { key: "QUESTION SUSPECT", label: "QUESTION" },
  { key: "ACCUSE", label: "ACCUSE" },
];

export default function ActionBar({
  showHints,
  investigatedHere,
  canInvestigate = true,
  accuseLabel = "ACCUSE",
  canAccuse = false,
  accuseUrgent = false,
  locked = false,
  onToggleHints,
  onAction,
}) {
  const handle = (key) => (key === "MOVE" ? onToggleHints?.() : onAction?.(key));
  const labelFor = (a) => {
    if (a.key === "ACCUSE") return locked ? "LOCKED IN ✓" : accuseLabel;
    if (a.key === "INVESTIGATE" && investigatedHere) return "SEARCHED";
    return a.label;
  };
  return (
    <div className="action-bar">
      {ACTIONS.map((a) => {
        const searched = a.key === "INVESTIGATE" && investigatedHere;
        const cantInvestigate = a.key === "INVESTIGATE" && !canInvestigate;
        const accuseLocked = a.key === "ACCUSE" && !canAccuse;
        const disabled = locked || searched || cantInvestigate || accuseLocked;
        const cls = [
          "act-btn",
          a.key === "MOVE" && showHints && !locked ? "active" : "",
          a.key === "ACCUSE" ? "accuse" : "",
          a.key === "ACCUSE" && locked ? "locked" : "",
          a.key === "ACCUSE" && canAccuse && !locked ? (accuseUrgent ? "urgent" : "ready") : "",
          disabled ? "disabled" : "",
        ].filter(Boolean).join(" ");
        return (
          <button key={a.key} className={cls} disabled={disabled} onClick={() => handle(a.key)}>
            {labelFor(a)}
          </button>
        );
      })}
    </div>
  );
}
