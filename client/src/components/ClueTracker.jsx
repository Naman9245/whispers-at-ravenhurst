// Right section of the unified HUD bar. Shows ONLY each player's found-count out
// of the total — never which room, what the clue is, or where anyone is. Uses a
// progress bar (not 7 boxes) so the count always fits inside the panel.
const PLAYERS = [
  { id: "holmes", name: "Holmes", color: "#6fd6c4" },
  { id: "watson", name: "Watson", color: "#f0b85c" },
];

export default function ClueTracker({ total = 5, counts = {}, me }) {
  return (
    <div className="hud-sec hud-clues">
      <div className="ct-title">CLUES FOUND</div>
      {PLAYERS.map((p) => {
        const n = counts[p.id] || 0;
        const pct = total ? Math.round((Math.min(n, total) / total) * 100) : 0;
        return (
          <div className="ct-row" key={p.id}>
            <span className="ct-name" style={{ color: p.color }}>
              {p.name}{me === p.id && <span className="ct-you"> (you)</span>}
            </span>
            <span className="ct-bar">
              <span className="ct-fill" style={{ width: `${pct}%`, background: p.color, boxShadow: `0 0 6px ${p.color}` }} />
            </span>
            <span className="ct-count" style={{ color: p.color }}>{n}/{total}</span>
          </div>
        );
      })}
    </div>
  );
}
