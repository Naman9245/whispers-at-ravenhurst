// Bottom-left action log. Small and unobtrusive: each entry is a single
// truncated line (the full clue lives in the notebook evidence list), and the
// whole log auto-fades to 30% after 5s of quiet, returning to full opacity on
// hover. Consecutive movement notes from the same player collapse into "×N".
// Lines: [{ who, color, text, kind, ts }]  kind: "move" | "ambient" | "clue" | "system"
const MAX_LINES = 8;
const IDLE_FADE_MS = 5000;

export default function ChatLog({ lines = [] }) {
  // Collapse runs of movement notes from the same player.
  const compressed = [];
  for (const l of lines) {
    const last = compressed[compressed.length - 1];
    if (last && l.kind === "move" && last.kind === "move" && last.who === l.who) {
      last.count = (last.count || 1) + 1;
      last.ts = l.ts;
    } else {
      compressed.push({ ...l });
    }
  }
  const shown = compressed.slice(-MAX_LINES);
  const lastTs = shown.length ? shown[shown.length - 1].ts : 0;
  const dim = lastTs && Date.now() - lastTs > IDLE_FADE_MS;

  return (
    <div className={`chat-log ${dim ? "dim" : ""}`}>
      {shown.map((l, i) => (
        <div key={i} className={`chat-line ${l.kind || "ambient"}`}>
          <span className="cl-who" style={{ color: l.color }}>
            [{l.who}]{l.count > 1 ? ` ×${l.count}` : ""}:{" "}
          </span>
          <span className="cl-text">{l.text}</span>
        </div>
      ))}
    </div>
  );
}
