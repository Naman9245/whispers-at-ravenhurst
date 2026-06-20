import { useState } from "react";
import { net } from "../net/socket.js";

// Lobby: create a room (you become Holmes) or join one by code (you become
// Watson). On create, we wait here showing the code until the server emits
// game:start (handled in App when the second player joins).
export default function Lobby({ onError }) {
  const [mode, setMode] = useState("home");   // "home" | "create" | "join" | "waiting"
  const [name, setName] = useState("");
  const [devMode, setDevMode] = useState(false);
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
      <div className="lobby-title">
        <span>WHISPERS AT</span>
        <span>RAVENHURST</span>
      </div>
      <p className="lobby-tagline">A two-detective race to the truth.</p>

      <div className="lobby-card">
        {mode === "home" && (
          <div className="lobby-actions">
            <button className="lb-btn primary" onClick={() => setMode("create")}>Create Room</button>
            <button className="lb-btn" onClick={() => setMode("join")}>Join with Code</button>
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
            <div className="lb-label">Share this code with your opponent</div>
            <div className="lb-code-display">{waitingCode}</div>
            {devMode && <div className="lb-devtag">DEV MODE</div>}
            <div className="lb-spinner">Waiting for a second detective…</div>
          </div>
        )}
      </div>
    </div>
  );
}
