import { useState, useEffect } from "react";

// "Detective's Desk" — the main-menu settings panel. A clean parchment-toned
// panel (not an illustrated desk scene): Sound, Fullscreen, and a Dev Mode
// DEFAULT. Sound reuses App's existing soundOn state/persistence untouched.
// Dev Mode here is only a saved default that pre-checks the lobby's per-room
// checkbox (localStorage "wr.devModeDefault") — the lobby checkbox remains the
// actual per-room source of truth sent to the server at room creation.

const readDevDefault = () => {
  try { return localStorage.getItem("wr.devModeDefault") === "1"; } catch { return false; }
};

export default function DeskPanel({ soundOn, onToggleSound, onClose }) {
  const [devDefault, setDevDefault] = useState(readDevDefault);
  const [isFs, setIsFs] = useState(() => Boolean(document.fullscreenElement));
  const fsSupported = Boolean(document.documentElement.requestFullscreen);

  // Track fullscreen reality (the user can exit with Esc — the label must follow).
  useEffect(() => {
    const sync = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  const toggleDevDefault = () => {
    const next = !devDefault;
    setDevDefault(next);
    try { localStorage.setItem("wr.devModeDefault", next ? "1" : "0"); } catch { /* private mode */ }
  };

  return (
    <div className="mm-panel-backdrop" onClick={onClose}>
      <div className="mm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mm-panel-head">
          <span>⚙ DETECTIVE&apos;S DESK</span>
          <button className="panel-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <button className="menu-item" onClick={onToggleSound}>
          <span>Sound</span>
          <b className={soundOn ? "on" : "off"}>{soundOn ? "ON" : "OFF"}</b>
        </button>

        {fsSupported && (
          <button className="menu-item" onClick={toggleFullscreen}>
            <span>Fullscreen</span>
            <b className={isFs ? "on" : "off"}>{isFs ? "ON" : "OFF"}</b>
          </button>
        )}

        <button className="menu-item" onClick={toggleDevDefault}>
          <span>Dev Mode default <em className="mm-hint">(pre-checks it when creating a room)</em></span>
          <b className={devDefault ? "on" : "off"}>{devDefault ? "ON" : "OFF"}</b>
        </button>

        <div className="mm-panel-foot">
          <button className="lb-btn ghost" onClick={onClose}>‹ Back to the manor</button>
        </div>
      </div>
    </div>
  );
}
