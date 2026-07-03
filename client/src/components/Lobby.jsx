import { useState } from "react";
import { net } from "../net/socket.js";
import { playNotebookOpen } from "../game/sound.js";

// Lobby: create a room (you become Holmes) or join one by code (you become
// Watson). On create, we wait here showing the code until the server emits
// game:start (handled in App when the second player joins). Rendered over the
// SAME living MenuBackdrop as the main menu (App owns it) — visually this is
// the same scene with a different foreground panel. `onBack` returns to the
// main menu (shown on the home mode only — never while a room is in flight).
export default function Lobby({ onError, onBack }) {
  const [mode, setMode] = useState("home");   // "home" | "create" | "join" | "waiting"
  const [name, setName] = useState("");
  // Pre-checked from the Detective's Desk "Dev Mode default" (main menu). The
  // checkbox here remains the per-room source of truth sent to the server.
  const [devMode, setDevMode] = useState(() => {
    try { return localStorage.getItem("wr.devModeDefault") === "1"; } catch { return false; }
  });
  const [code, setCode] = useState("");
  const [waitingCode, setWaitingCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const create = async () => {
    setBusy(true); setErr("");
    const res = await net.createRoom(name || "Holmes", devMode);
    setBusy(false);
    if (!res?.ok) return setErr(res?.error || "Could not create room.");
    setWaitingCode(res.code);
    setMode("waiting");
  };

  const join = async () => {
    setBusy(true); setErr("");
    const res = await net.joinRoom(code, name || "Watson");
    setBusy(false);
    if (!res?.ok) return setErr(res?.error || "Could not join room.");
    // App's game:start listener takes over from here.
  };

  return (
    <div className="lobby">
      {/* ← back to the main menu (only while nothing is in flight) */}
      {mode === "home" && onBack && (
        <button className="mm-back lobby-back" onMouseEnter={() => playNotebookOpen()} onClick={onBack}>
          ← Back
        </button>
      )}

      <div className="lobby-title">
        <span>WHISPERS AT</span>
        <span>RAVENHURST</span>
      </div>
      <p className="lobby-tagline">A two-detective race to the truth.</p>

      <div className="lobby-card">
        {mode === "home" && (
          <div className="lobby-actions">
            {/* Same case-file-tab style as the main menu buttons. Icons come
                from CSS content (data-icon) so textContent stays EXACTLY
                "Create Room" / "Join with Code" — every e2e suite matches on it. */}
            <button className="mm-btn" data-icon="🗝" onMouseEnter={() => playNotebookOpen()} onClick={() => setMode("create")}>Create Room</button>
            <button className="mm-btn" data-icon="✉" onMouseEnter={() => playNotebookOpen()} onClick={() => setMode("join")}>Join with Code</button>
          </div>
        )}

        {mode === "create" && (
          <div className="lobby-form">
            <label className="lb-label">Your name</label>
            <input className="lb-input" value={name} placeholder="Holmes"
              maxLength={16} onChange={(e) => setName(e.target.value)} />
            <label className="lb-check">
              <input type="checkbox" checked={devMode} onChange={(e) => setDevMode(e.target.checked)} />
              <span>Dev Mode <em>(short timers: 60s / 20s / 30s)</em></span>
            </label>
            {err && <div className="lb-error">{err}</div>}
            <div className="lb-row">
              <button className="lb-btn ghost" onClick={() => { setMode("home"); setErr(""); }}>Back</button>
              <button className="lb-btn primary" disabled={busy} onClick={create}>
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        )}

        {mode === "join" && (
          <div className="lobby-form">
            <label className="lb-label">Your name</label>
            <input className="lb-input" value={name} placeholder="Watson"
              maxLength={16} onChange={(e) => setName(e.target.value)} />
            <label className="lb-label">Room code</label>
            <input className="lb-input code" value={code} placeholder="RAVE1" maxLength={5}
              onChange={(e) => setCode(e.target.value.toUpperCase())} />
            {err && <div className="lb-error">{err}</div>}
            <div className="lb-row">
              <button className="lb-btn ghost" onClick={() => { setMode("home"); setErr(""); }}>Back</button>
              <button className="lb-btn primary" disabled={busy || code.length < 5} onClick={join}>
                {busy ? "Joining…" : "Join"}
              </button>
            </div>
          </div>
        )}

        {mode === "waiting" && (
          <div className="lobby-waiting">
            <div className="lb-label">Case file opened — share this code with your partner</div>
            {/* "CASE #" framing comes from a CSS ::before — the element's
                textContent must stay the RAW code (e2e scripts parse it). */}
            <div className="lb-code-display">{waitingCode}</div>
            {devMode && <div className="lb-devtag">DEV MODE</div>}
            <div className="lb-spinner">Waiting for your partner detective…</div>
          </div>
        )}
      </div>
    </div>
  );
}
