import { useState } from "react";

// Final accusation. The player names a culprit, weapon and room, then cites 2–3
// supporting clues from their own evidence. LOCK IN is always clickable: if the
// form is incomplete it explains exactly what's missing; if complete it submits
// (irreversibly) and the server validates. Success closes the modal; a server
// rejection is shown inline so the player can fix it and retry.

const PORTRAIT_COLORS = ["#7a3a8c", "#c79a3a", "#b03a4a", "#3a5ab0", "#3a8c4a", "#9a6a3a"];
const MIN_CLUES = 2;
const MAX_CLUES = 3;

export default function AccusationModal({ caseInfo, foundClues = [], onSubmit, onClose }) {
  const suspects = caseInfo?.suspects || [];
  const weapons = caseInfo?.weapons || [];
  const rooms = caseInfo?.rooms || [];

  const [culpritId, setCulpritId] = useState(null);
  const [weaponId, setWeaponId] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [clueIds, setClueIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = (setter) => (val) => { setError(""); setter(val); };

  const toggleClue = (id) => {
    setError("");
    setClueIds((cur) =>
      cur.includes(id) ? cur.filter((c) => c !== id) : cur.length >= MAX_CLUES ? cur : [...cur, id]
    );
  };

  // Returns a specific reason the accusation can't be submitted, or "" if ready.
  const validate = () => {
    if (!culpritId) return "Choose a culprit.";
    if (!weaponId) return "Choose a weapon.";
    if (!roomId) return "Choose a room.";
    if (clueIds.length < MIN_CLUES) return `Cite at least ${MIN_CLUES} supporting clues — you've selected ${clueIds.length}.`;
    if (clueIds.length > MAX_CLUES) return `Cite at most ${MAX_CLUES} clues.`;
    return "";
  };
  const ready = validate() === "";

  const submit = async () => {
    const msg = validate();
    if (msg) { setError(msg); return; }
    setBusy(true); setError("");
    const res = await onSubmit({ culpritId, weaponId, roomId, clueIds });
    setBusy(false);
    if (res && res.ok === false) setError(res.error || "Could not lock in — please try again.");
    // On success the parent closes this modal (this component unmounts).
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="accuse-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2 className="modal-title">Make Your Accusation</h2>
        <p className="modal-sub">Name the culprit, the weapon, and the room — then cite the evidence that proves it.</p>

        <div className="accuse-section">
          <div className="accuse-label">Culprit {culpritId && <span className="accuse-ok">✓</span>}</div>
          <div className="accuse-grid suspects">
            {suspects.map((s, i) => (
              <button key={s.id} className={`pick-card ${culpritId === s.id ? "on" : ""}`} onClick={() => pick(setCulpritId)(s.id)}>
                <span className="pick-portrait" style={{ background: PORTRAIT_COLORS[i % 6] }}>S{i + 1}</span>
                <span className="pick-name">{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="accuse-section">
          <div className="accuse-label">Weapon {weaponId && <span className="accuse-ok">✓</span>}</div>
          <div className="accuse-grid">
            {weapons.map((w) => (
              <button key={w.id} className={`pick-chip ${weaponId === w.id ? "on" : ""}`} onClick={() => pick(setWeaponId)(w.id)}>
                {w.name}
              </button>
            ))}
          </div>
        </div>

        <div className="accuse-section">
          <div className="accuse-label">Room {roomId && <span className="accuse-ok">✓</span>}</div>
          <div className="accuse-grid">
            {rooms.map((r) => (
              <button key={r.id} className={`pick-chip ${roomId === r.id ? "on" : ""}`} onClick={() => pick(setRoomId)(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="accuse-section">
          <div className="accuse-label">
            Supporting evidence ({clueIds.length}/{MAX_CLUES}, pick {MIN_CLUES}–{MAX_CLUES})
            {clueIds.length >= MIN_CLUES && <span className="accuse-ok">✓</span>}
          </div>
          {foundClues.length === 0 ? (
            <p className="accuse-noclues">You have gathered no evidence to cite. Investigate rooms first, then accuse.</p>
          ) : (
            <ul className="accuse-clues">
              {foundClues.map((c) => {
                const on = clueIds.includes(c.id);
                const blocked = !on && clueIds.length >= MAX_CLUES;
                return (
                  <li key={c.id}>
                    <button className={`accuse-clue ${on ? "on" : ""}`} disabled={blocked} onClick={() => toggleClue(c.id)}>
                      <span className="ac-check">{on ? "✓" : ""}</span>
                      <span>{c.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && <div className="accuse-error">⚠ {error}</div>}
        <p className="accuse-warn-note">Locking in is final — you cannot change your accusation afterward.</p>

        <button
          className={`lock-in-btn ${ready ? "" : "incomplete"}`}
          disabled={busy}
          onClick={submit}
        >
          {busy ? "Locking in…" : "LOCK IN ACCUSATION"}
        </button>
      </div>
    </div>
  );
}
