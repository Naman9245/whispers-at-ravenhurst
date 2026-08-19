import { useState } from "react";
import { net } from "../net/socket.js";
import { playNotebookOpen } from "../game/sound.js";
import { SETTING_OPTIONS, DEFAULT_SETTINGS, DEV_SETTINGS } from "@shared/constants.js";

// Human labels for the setting values. Timers are stored in SECONDS (matching
// TIMER_PRESETS) but read in minutes, and null genuinely means "no limit" rather
// than zero — the server never arms a force-resolve for it.
const MINUTES = (v) => (v == null ? "Off" : `${v / 60}m`);
const ONOFF = (v) => (v ? "On" : "Off");

// Row order is deliberate: the time limit is the whole point of this panel, so
// it leads; the two privacy/difficulty dials come last.
const ROWS = [
  { key: "softTimer",      label: "Time limit",      fmt: MINUTES, hint: "Off = play until someone accuses" },
  { key: "accuseGate",     label: "Accuse opens at", fmt: MINUTES, hint: "Investigate first" },
  { key: "opponentWindow", label: "Rival window",    fmt: MINUTES, hint: "Their time to answer once you lock in" },
  { key: "hotspotMarkers", label: "Hotspot markers", fmt: ONOFF,   hint: "Off hides what's searchable — harder" },
  { key: "sprint",         label: "Sprint (Shift)",  fmt: ONOFF,   hint: "" },
  { key: "rivalProgress",  label: "Rival progress",  fmt: ONOFF,   hint: "Off hides their clue count" },
];

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
  // Host-chosen room settings. Ticking Dev Mode stamps the short-timer preset in,
  // so the checkbox reads as a preset button rather than a competing source of
  // truth — and the server falls back to DEV_SETTINGS from `devMode` alone anyway.
  const [settings, setSettings] = useState(
    () => (typeof localStorage !== "undefined" && localStorage.getItem("wr.devModeDefault") === "1"
      ? { ...DEV_SETTINGS } : { ...DEFAULT_SETTINGS })
  );
  const setSetting = (key, value) => setSettings((s) => ({ ...s, [key]: value }));
  const toggleDev = (on) => {
    setDevMode(on);
    setSettings((s) => ({ ...s, ...(on ? DEV_SETTINGS : DEFAULT_SETTINGS) }));
  };
  const [code, setCode] = useState("");
  const [waitingCode, setWaitingCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const create = async () => {
    setBusy(true); setErr("");
    const res = await net.createRoom(name || "Holmes", devMode, settings);
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

      {/* Solid title card (shared with the main menu) so the title + tagline are
          always readable over the animated backdrop — no room label bleeds through. */}
      <div className="mm-titlecard">
        <div className="lobby-title">
          <span>WHISPERS AT</span>
          <span>RAVENHURST</span>
        </div>
        <p className="lobby-tagline">A two-detective race to the truth.</p>
      </div>

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
            {/* Keep this the ONLY .lb-check on the page — twelve e2e suites click
                `.lb-check input[type="checkbox"]` to turn on short timers. New
                controls below deliberately use different class names. */}
            <label className="lb-check">
              <input type="checkbox" checked={devMode} onChange={(e) => toggleDev(e.target.checked)} />
              <span>Dev Mode <em>(short timers: 60s / 20s / 30s)</em></span>
            </label>

            <div className="lb-settings">
              <div className="lb-settings-head">Game settings</div>
              {ROWS.map((row) => (
                <div className="set-row" key={row.key}>
                  <span className="set-label">
                    {row.label}
                    {row.hint && <em className="set-hint">{row.hint}</em>}
                  </span>
                  <span className="set-opts">
                    {SETTING_OPTIONS[row.key].map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        className={`set-opt ${settings[row.key] === v ? "on" : ""}`}
                        onClick={() => setSetting(row.key, v)}
                      >
                        {row.fmt(v)}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>

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
