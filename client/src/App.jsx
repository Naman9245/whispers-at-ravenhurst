import { useState, useEffect, useRef, useCallback } from "react";
import { net } from "./net/socket.js";
import Lobby from "./components/Lobby.jsx";
import BoardCanvas from "./game/BoardCanvas.jsx";
import PlayerHud from "./components/PlayerHud.jsx";
import ActionBar from "./components/ActionBar.jsx";
import ClueTracker from "./components/ClueTracker.jsx";
import ActivityLog from "./components/ActivityLog.jsx";
import GameMenu from "./components/GameMenu.jsx";
import TimerBar from "./components/TimerBar.jsx";
import DeductionNotebook from "./components/DeductionNotebook.jsx";
import SuspectModal from "./components/SuspectModal.jsx";
import AccusationModal from "./components/AccusationModal.jsx";
import ExamineModal from "./components/ExamineModal.jsx";
import RevealScreen from "./components/RevealScreen.jsx";
import { unlockAudio, playTick, setMuted } from "./game/sound.js";
import "./index.css";

const COLOR = { holmes: "#6fd6c4", watson: "#f0b85c" };

function fmtMs(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Top-level phases: "lobby" until two players are in, then "playing". The server
// is authoritative for game state; the client owns its own free-roam position and
// reports region changes back. Renders from the `view` the server pushes.
//
// Layout philosophy: the mansion board is the HERO. The HUD is one slim fixed bar;
// the activity log and notebook live behind toggles and slide in from the edges,
// so nothing covers the board during normal play.
export default function App() {
  const [view, setView] = useState(null);
  const [chat, setChat] = useState([]);
  const [showHints, setShowHints] = useState(false);
  const [showSuspects, setShowSuspects] = useState(false);
  const [showAccuse, setShowAccuse] = useState(false);
  const [examineResult, setExamineResult] = useState(null);
  const [reveal, setReveal] = useState(null);
  const [dialogues, setDialogues] = useState({});
  const [region, setRegion] = useState(null);   // local movement: { room, inCorridor }
  const [toast, setToast] = useState("");
  const [, setTick] = useState(0);              // 1s heartbeat for countdowns/fade

  // Slide-in panels (board stays the focus; these open on demand).
  const [showActivity, setShowActivity] = useState(false);
  const [showNotebook, setShowNotebook] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [seen, setSeen] = useState(0);          // activity entries already viewed
  const [pingDot, setPingDot] = useState(false);

  const toastTimer = useRef(null);
  const clockOffset = useRef(0);                // serverNow - clientNow
  const accuseAnnounced = useRef(false);        // toasted when the window opened
  const oppLockedAnnounced = useRef(false);     // toasted when rival locked in
  const tickBurstFired = useRef(false);         // fired the one-time 1-min tick burst

  const flash = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  const pushChat = useCallback((entry) => {
    setChat((c) => [...c.slice(-29), { ts: Date.now(), kind: "ambient", ...entry }]);
  }, []);

  const applyView = useCallback((v) => {
    if (v?.accusation?.now) clockOffset.current = v.accusation.now - Date.now();
    setView(v);
  }, []);

  // Wire server events once.
  useEffect(() => {
    const offStart = net.on("game:start", (v) => {
      applyView(v);
      setReveal(null);
      setRegion(null);
      accuseAnnounced.current = false;
      oppLockedAnnounced.current = false;
      tickBurstFired.current = false;
      setExamineResult(null);
      setShowActivity(false); setShowNotebook(false); setShowMenu(false);
      setSeen(1); setPingDot(false);
      setChat([{ who: "System", color: "#9ad6a0", kind: "system", ts: Date.now(), text: "Both detectives have entered Ravenhurst." }]);
    });
    const offUpdate = net.on("state:update", (v) => applyView(v));
    const offChat = net.on("chat", (line) =>
      setChat((c) => [...c.slice(-29), {
        who: line.who, color: COLOR[line.character] || "#ccc", text: line.text,
        kind: line.kind || "ambient", ts: Date.now(),
      }])
    );
    const offPeer = net.on("peer:status", ({ connected }) =>
      flash(connected ? "Opponent reconnected." : "Opponent disconnected…")
    );
    const offReveal = net.on("game:reveal", (payload) => { setReveal(payload); setShowAccuse(false); });
    return () => { offStart(); offUpdate(); offChat(); offPeer(); offReveal(); };
  }, [flash, applyView]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Activity badge: count unread while the panel is closed; brief red ping on new.
  useEffect(() => {
    if (showActivity) { setSeen(chat.length); return; }
    if (chat.length > seen) {
      setPingDot(true);
      const t = setTimeout(() => setPingDot(false), 1200);
      return () => clearTimeout(t);
    }
  }, [chat.length, showActivity, seen]);

  // Sound on/off (menu toggle).
  useEffect(() => { setMuted(!soundOn); }, [soundOn]);

  // Unlock Web Audio on the first user gesture (autoplay policy).
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Free-roam: the board reports when we enter a new room / the corridor.
  const handleRegionChange = useCallback((room, inCorridor) => {
    setRegion({ room, inCorridor });
    net.enterRegion(room, inCorridor);
  }, []);

  const roomLabelOf = useCallback(
    (id) => view?.caseInfo?.rooms?.find((r) => r.id === id)?.label || id,
    [view]
  );

  const handleExamine = useCallback(async (hotspotId) => {
    const res = await net.examine(hotspotId);
    if (!res?.ok) return flash(res?.error || "Can't examine that.");
    setExamineResult(res);
    if (res.found) {
      flash("Evidence found!");
      pushChat({ who: "System", color: "#f0b85c", kind: "clue", text: `You examined ${res.hotspotName} and found evidence:` });
      pushChat({ who: "Clue", color: "#f0b85c", kind: "clue", text: res.clue.text });
    } else {
      pushChat({ who: "System", color: "#9ad6a0", kind: "system", text: `You examined ${res.hotspotName} — nothing of interest.` });
    }
  }, [flash, pushChat]);

  const askSuspect = useCallback(async (suspectId, questionId, questionText) => {
    const res = await net.askSuspect(suspectId, questionId);
    if (!res?.ok) { flash(res?.error || "Can't ask that."); return res; }
    setDialogues((d) => ({ ...d, [suspectId]: [...(d[suspectId] || []), { q: questionText, a: res.answer }] }));
    return res;
  }, [flash]);

  const confrontSuspect = useCallback(async (suspectId, clueId, clueText) => {
    const res = await net.confrontSuspect(suspectId, clueId);
    if (!res?.ok) { flash(res?.error || "Can't confront with that."); return res; }
    setDialogues((d) => ({
      ...d,
      [suspectId]: [...(d[suspectId] || []), { q: `You produce the evidence: “${clueText}”`, a: res.response.text, tell: res.response.tell }],
    }));
    return res;
  }, [flash]);

  const submitAccusation = useCallback(async (payload) => {
    const res = await net.accuse(payload);
    if (!res?.ok) return res;   // modal shows the specific error inline
    setShowAccuse(false);
    flash("Accusation locked — awaiting opponent's accusation…");
    return res;
  }, [flash]);

  const backToLobby = useCallback(() => {
    setReveal(null); setView(null); setShowAccuse(false); setExamineResult(null);
    setShowSuspects(false); setDialogues({}); setChat([]); setRegion(null);
    setShowActivity(false); setShowNotebook(false); setShowMenu(false);
  }, []);

  // Accusation timing (derived each heartbeat).
  const acc = view?.accusation;
  const serverNow = Date.now() + clockOffset.current;
  const youLocked = Boolean(acc?.youLocked);
  const gateMsLeft = acc?.opensAt ? acc.opensAt - serverNow : 0;
  const canAccuse = view?.status === "playing" && !youLocked && gateMsLeft <= 0;
  // Time left to actually ACT: the final window if open, else the soft game-end.
  const gameEndAt = acc?.startedAt ? acc.finalDeadline || acc.startedAt + acc.softMs : 0;
  const actMsLeft = gameEndAt ? Math.max(0, gameEndAt - serverNow) : 0;
  // ONE urgency state: the final minute. Calm green before, red visuals after —
  // no banners, no continuous sound (just a 3-second tick burst at the 1:00 mark).
  const urgent = view?.status === "playing" && Boolean(acc?.startedAt) && actMsLeft > 0 && actMsLeft <= 60_000;
  const accuseUrgent = canAccuse && urgent;
  const accuseLabel = youLocked
    ? "LOCKED IN ✓"
    : gateMsLeft > 0
      ? `OPENS (${fmtMs(gateMsLeft)})`
      : `ACCUSE (${fmtMs(actMsLeft)})`;

  // Toast (no sound) the moment the accusation window opens — informational only.
  useEffect(() => {
    if (canAccuse && !accuseAnnounced.current) {
      accuseAnnounced.current = true;
      flash("Accusation window open — you may now accuse.");
    }
  }, [canAccuse, flash]);

  // Toast (no banner) the moment the rival locks in — replaces the old banner.
  useEffect(() => {
    if (acc?.opponentLocked && !youLocked && !oppLockedAnnounced.current) {
      oppLockedAnnounced.current = true;
      flash("Your rival has locked in — submit your accusation!");
    }
  }, [acc?.opponentLocked, youLocked, flash]);

  // A single ~3-second tick burst the instant the final minute begins, then silence.
  useEffect(() => {
    if (!urgent || tickBurstFired.current) return;
    tickBurstFired.current = true;
    let n = 0;
    const id = setInterval(() => { playTick(); if (++n >= 7) clearInterval(id); }, 420);
    const stop = setTimeout(() => clearInterval(id), 3000);
    return () => { clearInterval(id); clearTimeout(stop); };
  }, [urgent]);

  const handleAction = useCallback((key) => {
    if (youLocked) return flash("You've locked in — awaiting your opponent.");
    if (key === "QUESTION SUSPECT") return setShowSuspects(true);
    if (key === "ACCUSE") {
      if (canAccuse) return setShowAccuse(true);
      return flash(`Accusations open in ${fmtMs(gateMsLeft)}.`);
    }
    flash("Coming soon.");
  }, [flash, canAccuse, youLocked, gateMsLeft]);

  const openActivity = useCallback(() => {
    setShowActivity(true); setSeen(chat.length); setPingDot(false); setShowMenu(false);
  }, [chat.length]);

  if (reveal) {
    return <RevealScreen reveal={reveal} me={view?.you?.character} onPlayAgain={backToLobby} onMainMenu={backToLobby} />;
  }
  if (!view || view.status === "lobby") {
    return <Lobby onError={flash} />;
  }

  const me = view.you.character;
  const counts = { [me]: view.you.clueCount, [view.opponent?.character]: view.opponent?.clueCount || 0 };

  // Current region: local movement is authoritative for UI; fall back to server.
  const curRoom = region?.room ?? view.you.room;
  const inCorridor = region?.inCorridor ?? view.you.inCorridor ?? false;
  const modalOpen = showSuspects || showAccuse || Boolean(examineResult);
  const unread = Math.max(0, chat.length - seen);

  return (
    <div className="app">
      {/* ===== Cohesive top HUD bar (fixed height, never grows) ===== */}
      <div className="hud-bar">
        <PlayerHud
          name={view.you.name}
          color={COLOR[me]}
          roomLabel={roomLabelOf(curRoom)}
          inCorridor={inCorridor}
          lockedIn={youLocked}
        />
        <TimerBar accusation={acc} serverNow={serverNow} />
        <ClueTracker total={view.progressTotal} counts={counts} me={me} />

        <div className="hud-tools">
          <button className={`hud-tool ${pingDot ? "ping" : ""}`} onClick={openActivity} title="Activity log">
            📜 <span className="ht-label">Activity</span>
            {unread > 0 && <span className="ht-badge">{unread}</span>}
          </button>
          <button className={`hud-tool ${showNotebook ? "on" : ""}`} onClick={() => { setShowNotebook((v) => !v); setShowMenu(false); }} title="Notebook">
            📓 <span className="ht-label">Notebook</span>
          </button>
          <button className={`hud-tool icon ${showMenu ? "on" : ""}`} onClick={() => { setShowMenu((v) => !v); }} title="Menu" aria-label="Menu">☰</button>
        </div>
      </div>

      {/* ===== Compact action pills ===== */}
      <ActionBar
        showHints={showHints}
        accuseLabel={accuseLabel}
        canAccuse={canAccuse}
        accuseUrgent={accuseUrgent}
        locked={youLocked}
        onToggleHints={() => setShowHints((s) => !s)}
        onAction={handleAction}
      />

      {/* ===== Mansion board — the hero, fills the rest of the viewport ===== */}
      <main className="board-hero">
        <BoardCanvas
          me={me}
          startRoom={view.you.room}
          showReachable={showHints}
          inputEnabled={!modalOpen && !youLocked}
          examined={view.you.examinedHotspots || []}
          onExamine={handleExamine}
          onRegionChange={handleRegionChange}
        />
        {toast && <div className="toast">{toast}</div>}
        {/* Final-minute urgency: subtle RED glow at the screen edges (not the centre) */}
        {urgent && <div className="vignette-edges" aria-hidden="true" />}
      </main>

      {/* ===== Slide-in panels (do not cover the board during normal play) ===== */}
      <ActivityLog open={showActivity} lines={chat} onClose={() => setShowActivity(false)} />

      {showNotebook && (
        <aside className="notebook-sidebar">
          <div className="panel-head">
            <span>NOTEBOOK</span>
            <button className="panel-x" onClick={() => setShowNotebook(false)} aria-label="Close">×</button>
          </div>
          <DeductionNotebook
            caseInfo={view.caseInfo}
            foundClues={view.you.foundClues}
            examinedHotspots={view.you.examinedHotspots || []}
          />
        </aside>
      )}

      <GameMenu
        open={showMenu}
        soundOn={soundOn}
        roomCode={view.roomCode}
        devMode={view.devMode}
        onToggleSound={() => setSoundOn((s) => !s)}
        onExit={backToLobby}
        onClose={() => setShowMenu(false)}
      />

      {showSuspects && (
        <SuspectModal
          caseInfo={view.caseInfo}
          foundClues={view.you.foundClues}
          questioning={view.you.questioning}
          dialogues={dialogues}
          onAsk={askSuspect}
          onConfront={confrontSuspect}
          onClose={() => setShowSuspects(false)}
        />
      )}

      {showAccuse && (
        <AccusationModal
          caseInfo={view.caseInfo}
          foundClues={view.you.foundClues}
          onSubmit={submitAccusation}
          onClose={() => setShowAccuse(false)}
        />
      )}

      {examineResult && (
        <ExamineModal result={examineResult} onClose={() => setExamineResult(null)} />
      )}
    </div>
  );
}
