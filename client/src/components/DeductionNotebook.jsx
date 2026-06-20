import { useState } from "react";
import { ROOM_HOTSPOTS, HOTSPOT_BY_ID } from "@shared/roomHotspots.js";

// Right-hand deduction notebook. Bound to the live case (caseInfo) and the
// player's own found clues (foundClues). Everything the player marks here is
// LOCAL to this client — it is never sent to the server or the opponent.
//
// Suspects/Weapons/Rooms each carry a 3-state mark the player cycles by clicking:
//   unknown → suspected → cleared → unknown
// The evidence list is a separate panel; red herrings are NOT distinguished from
// real clues (the server doesn't tell us which is which — that's the puzzle).

const PORTRAIT_COLORS = ["#7a3a8c", "#c79a3a", "#b03a4a", "#3a5ab0", "#3a8c4a", "#9a6a3a"];
const TAG_LABEL = { physical_evidence: "Physical", testimony: "Testimony", document: "Document" };
const STATUS_ORDER = ["unknown", "suspected", "cleared"];
const STATUS_LABEL = { unknown: "", suspected: "SUSPECTED", cleared: "CLEARED" };
const nextStatus = (s) => STATUS_ORDER[(STATUS_ORDER.indexOf(s || "unknown") + 1) % STATUS_ORDER.length];

export default function DeductionNotebook({ caseInfo, foundClues = [], examinedHotspots = [] }) {
  const [tab, setTab] = useState("suspects");
  const [marks, setMarks] = useState({}); // `${type}:${id}` -> status (local only)
  const examinedSet = new Set(examinedHotspots);

  const statusOf = (key) => marks[key] || "unknown";
  const cycle = (key) => setMarks((m) => ({ ...m, [key]: nextStatus(m[key]) }));

  const suspects = caseInfo?.suspects || [];
  const weapons = caseInfo?.weapons || [];
  const rooms = caseInfo?.rooms || [];
  const roomLabel = Object.fromEntries(rooms.map((r) => [r.id, r.label]));

  return (
    <aside className="notebook">
      <h2 className="notebook-title">Deduction Notebook</h2>

      <div className="notebook-tabs">
        {["suspects", "weapons", "rooms"].map((t) => (
          <button key={t} className={`nb-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {tab === "suspects" && (
        <ul className="nb-list">
          {suspects.map((s, i) => {
            const key = `suspect:${s.id}`;
            const status = statusOf(key);
            return (
              <li key={s.id} className={`nb-row suspect status-${status}`} onClick={() => cycle(key)} title={s.blurb}>
                <span className="nb-chip" style={{ background: PORTRAIT_COLORS[i % 6] }}>S{i + 1}</span>
                <span className="nb-suspect-text">
                  <span className="nb-row-name">{s.name}</span>
                  <span className="nb-role">{s.role}</span>
                </span>
                {status !== "unknown" && <span className={`nb-status ${status}`}>{STATUS_LABEL[status]}</span>}
              </li>
            );
          })}
        </ul>
      )}

      {tab === "weapons" && (
        <ul className="nb-list">
          {weapons.map((w) => {
            const key = `weapon:${w.id}`;
            const status = statusOf(key);
            return (
              <li key={w.id} className={`nb-row status-${status}`} onClick={() => cycle(key)}>
                <span className="nb-row-name">{w.name}</span>
                {status !== "unknown" && <span className={`nb-status ${status}`}>{STATUS_LABEL[status]}</span>}
              </li>
            );
          })}
        </ul>
      )}

      {tab === "rooms" && (
        <ul className="nb-list">
          {rooms.map((r) => {
            const key = `room:${r.id}`;
            const status = statusOf(key);
            const spots = ROOM_HOTSPOTS[r.id] || [];
            const done = spots.filter((h) => examinedSet.has(h.id)).length;
            const searched = spots.length > 0 && done === spots.length;
            return (
              <li key={r.id} className={`nb-row room status-${status} ${searched ? "searched" : ""}`} onClick={() => cycle(key)}>
                <span className="nb-row-name">{r.label}</span>
                {searched
                  ? <span className="nb-searched">✓ Searched</span>
                  : done > 0 && <span className="nb-searched partial">{done}/{spots.length}</span>}
                {status !== "unknown" && <span className={`nb-status ${status}`}>{STATUS_LABEL[status]}</span>}
              </li>
            );
          })}
        </ul>
      )}

      <div className="nb-evidence">
        <div className="nb-evidence-head">EVIDENCE ({foundClues.length})</div>
        {foundClues.length === 0 ? (
          <p className="nb-evidence-empty">No evidence yet. Investigate rooms to gather clues.</p>
        ) : (
          <ul className="nb-evidence-list">
            {foundClues.map((c) => (
              <li key={c.id} className="nb-clue">
                <div className="nb-clue-meta">
                  <span className="nb-tag">{TAG_LABEL[c.tag] || c.tag}</span>
                  <span className="nb-clue-room">
                    {roomLabel[c.found_in] || c.found_in}
                    {c.hotspot && HOTSPOT_BY_ID[c.hotspot] ? ` — ${HOTSPOT_BY_ID[c.hotspot].name}` : ""}
                  </span>
                </div>
                <p className="nb-clue-text">{c.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
