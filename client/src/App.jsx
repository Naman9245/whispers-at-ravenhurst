import { useState, useEffect, useRef, useCallback } from "react";
import { SEARCH_MS, QUESTION_CAP } from "@shared/constants.js";
import { net } from "./net/socket.js";
import Lobby from "./components/Lobby.jsx";
import MainMenu from "./components/MainMenu.jsx";
import MenuBackdrop from "./components/MenuBackdrop.jsx";
import BoardCanvas from "./game/BoardCanvas.jsx";
import PlayerHud from "./components/PlayerHud.jsx";
import ActionBar from "./components/ActionBar.jsx";
import ActivityLog from "./components/ActivityLog.jsx";
import GameMenu from "./components/GameMenu.jsx";
import TimerBar from "./components/TimerBar.jsx";
import DeductionNotebook from "./components/DeductionNotebook.jsx";
import SuspectModal from "./components/SuspectModal.jsx";
import AccusationModal from "./components/AccusationModal.jsx";
import ExamineModal from "./components/ExamineModal.jsx";
import RevealScreen from "./components/RevealScreen.jsx";
import RivalHud from "./components/RivalHud.jsx";
import TabStrip from "./components/TabStrip.jsx";
import SuspectCard from "./components/SuspectCard.jsx";
import CaseBriefing from "./components/CaseBriefing.jsx";
import MapOverlay from "./components/MapOverlay.jsx";
import {
  unlockAudio, setMuted, playSearching, stopSearching, playClueFound, playNothingFound, playTickBurst,
  playRainLoop, stopRainLoop, playDoorCreak, playFloorCreak, playButtonClick, playNotebookOpen,
  playAccusationLockIn, playReveal,
} from "./game/sound.js";
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
  // Top-level phase BEFORE any server state exists: the cinematic main menu,
  // then the lobby. Once a game starts, `view` takes over. `?menu=skip` jumps
  // straight to the lobby (used by the .shots e2e suites).
  const [phase, setPhase] = useState(() => {
    try { return new URLSearchParams(location.search).get("menu") === "skip" ? "lobby" : "menu"; }
    catch { return "menu"; }
  });
  const [view, setView] = useState(null);
  const [chat, setChat] = useState([]);
  const [showHints, setShowHints] = useState(false);
  const [showSuspects, setShowSuspects] = useState(false);
  const [showAccuse, setShowAccuse] = useState(false);
  const [examineResult, setExamineResult] = useState(null);
  const [examining, setExamining] = useState(null);   // { hotspotId } during the 2.5s search
  const [reveal, setReveal] = useState(null);
  const [dialogues, setDialogues] = useState({});
  const [region, setRegion] = useState(null);   // local movement: { room, inCorridor }
  const [toast, setToast] = useState("");
  const [, setTick] = useState(0);              // 1s heartbeat for countdowns/fade

  // Slide-in panels (board stays the focus; these open on demand).
  const [showActivity, setShowActivity] = useState(false);
  const [showNotebook, setShowNotebook] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [openTab, setOpenTab] = useState(null);      // Scenario/Questions/Log strip
  // Suspect marks live HERE, not in the notebook, because two surfaces render
  // them now: the right-hand rail and (for weapons/rooms) the notebook. Leaving
  // them in the notebook's local state would have made the rail's marks vanish
  // whenever the notebook unmounted.
  const [marks, setMarks] = useState({});           // `${type}:${id}` -> status
  // `?menu=skip` already means "skip the ceremony" for the e2e suites, so it
  // skips the briefing too; `&briefing=1` opts back in.
  const [briefed, setBriefed] = useState(() => {
    try {
      const q = new URLSearchParams(location.search);
      return q.get("menu") === "skip" && q.get("briefing") !== "1";
    } catch { return false; }
  });
  const [showMap, setShowMap] = useState(false);   // manor map overlay (M)
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem("wr.soundOn") !== "0"; } catch { return true; }
  });
  const [audioUnlocked, setAudioUnlocked] = useState(false);  // first-gesture autoplay unlock ran
  const [seen, setSeen] = useState(0);          // activity entries already viewed
  const [pingDot, setPingDot] = useState(false);

  const toastTimer = useRef(null);
  const inGameRef = useRef(false);              // "am I still in a live game?" — read by the reveal guard
  const modalOpenRef = useRef(false);           // mirrored for the always-mounted map key handler
  const searchRef = useRef(null);              // active hotspot search: { timer, safety, stop }
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
      setExamineResult(null); setExamining(null);
      setShowActivity(false); setShowNotebook(false); setShowMenu(false);
      setOpenTab(null); setMarks({});
      setBriefed(() => {
        try {
          const q = new URLSearchParams(location.search);
          return q.get("menu") === "skip" && q.get("briefing") !== "1";
        } catch { return false; }
      });
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
    const offPeer = net.on("peer:status", ({ connected, left }) =>
      flash(left ? "Opponent left the game." : connected ? "Opponent reconnected." : "Opponent disconnected…")
    );
    const offReveal = net.on("game:reveal", (payload) => {
      // Guard: only accept a reveal for a game we are actually still in. A room
      // we exited can still resolve on its own soft cap, and this listener is
      // mounted for the whole app lifetime — without this check that stale
      // reveal would yank the player out of the menu/lobby/next game.
      if (!inGameRef.current) return;
      setReveal(payload); setShowAccuse(false);
      playReveal();   // dramatic sting the instant the truth is unveiled (rain bed stops via inGame)
    });
    return () => { offStart(); offUpdate(); offChat(); offPeer(); offReveal(); };
  }, [flash, applyView]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // M toggles the manor map; Esc closes it. Lives here rather than in
  // BoardCanvas because the overlay is React state, and it stays out of the way
  // while a modal owns the screen. BoardCanvas's key map already records "m" but
  // nothing reads it, so there is no double-handling.
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      const k = e.key?.toLowerCase();
      if (k === "m" && !modalOpenRef.current) setShowMap((v) => !v);
      else if (k === "escape") setShowMap(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  // Sound on/off (menu toggle) — applied to the manager and persisted so the
  // preference survives a refresh. Muting also stops anything currently playing.
  useEffect(() => {
    setMuted(!soundOn);
    try { localStorage.setItem("wr.soundOn", soundOn ? "1" : "0"); } catch { /* private mode */ }
  }, [soundOn]);

  // Where the storm ambience lives: every pre-game screen (menu AND lobby —
  // they share one continuous idle-mansion scene, so the storm carries through)
  // plus active gameplay. Only the reveal is storm-free.
  const inGame = view?.status === "playing" && !reveal;
  inGameRef.current = inGame;   // mirrored for the always-mounted game:reveal listener
  const atMenu = phase === "menu" && !view && !reveal;
  const preGame = !view && !reveal;
  const ambient = preGame || inGame;

  // Rain ambience: a quiet loop under the menu, the lobby and the whole game.
  // Stops at the reveal. Declared AFTER the mute effect so `muted` is fresh —
  // muting stops the bed (via setMuted→stopAll), and this re-runs on unmute
  // (soundOn dep) to resume it. The audioUnlocked dep matters on a FRESH page
  // load: the menu mounts before any gesture, so the first playRainLoop() no-ops
  // (autoplay lock); re-running after the unlock gesture actually starts it.
  useEffect(() => {
    if (ambient && soundOn) playRainLoop();
    else stopRainLoop();
  }, [ambient, soundOn, audioUnlocked]);

  // Random atmospheric creaks: every 30–90s (re-randomised each time) play EITHER
  // a door OR a floor creak — ONLY during real gameplay (the investigation phase),
  // never on the menu/lobby/panels. (Rain is `ambient`; creaks are strictly
  // `inGame` — the shared pre-game backdrop must stay silent of creaks.) A
  // self-rescheduling timeout (not a fixed interval) gives the varied cadence;
  // fire() no-ops while muted, so nothing creaks when the sound is off. Cleanup
  // clears the pending timeout, so menu→lobby→game can never stack schedulers.
  useEffect(() => {
    if (!inGame) return;
    let id;
    const schedule = () => {
      const delay = 30_000 + Math.random() * 60_000;   // 30–90s
      id = setTimeout(() => {
        (Math.random() < 0.5 ? playDoorCreak : playFloorCreak)();
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(id);
    // MUST depend on `inGame`, not `ambient`: ambient is ALREADY true on the
    // menu/lobby, so keying on it meant the dep never changed at lobby→game and
    // the effect never re-ran — the scheduler was never armed and creaks never
    // played at all. `inGame` is the flag this effect actually reads.
  }, [inGame]);

  // Universal UI click sound: one delegated listener guarantees playButtonClick()
  // on EVERY <button> in the game (action pills, modal pickers, menu items, close
  // ×, Play Again, lobby …) so no button can be missed. Buttons that own a
  // different sound opt out with data-sound="off" (the notebook buttons play the
  // notebook swish instead). Disabled buttons never dispatch a click, and canvas
  // hotspot examination isn't a <button>, so both are naturally excluded.
  //
  // CAPTURE phase (3rd arg = true) is essential: the modal wrappers call
  // e.stopPropagation() (to stop backdrop click-through), which — because React's
  // stopPropagation also stops the NATIVE event at the root — would otherwise hide
  // clicks on buttons INSIDE modals from a bubble-phase listener. Capture fires
  // top-down before any of that, so no button is ever missed.
  useEffect(() => {
    const onClick = (e) => {
      const btn = e.target.closest?.("button");
      if (btn && btn.dataset.sound !== "off") playButtonClick();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Unlock audio on the first user gesture (browser autoplay policy). Flips
  // audioUnlocked AFTER the priming settles so ambience that no-oped pre-gesture
  // (menu rain) re-triggers cleanly — mid-prime, startLoop would be skipped and
  // then paused by the prime itself.
  useEffect(() => {
    const unlock = () => {
      Promise.resolve(unlockAudio()).then(() => setAudioUnlocked(true));
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

  // STABLE close handler for the examine result modal. This identity matters:
  // ExamineModal arms its 5s auto-close in an effect keyed on [result, onClose],
  // and App re-renders every second (the countdown heartbeat). An inline arrow
  // here would be a fresh function every second, tearing down and re-arming that
  // timeout forever — the modal would never auto-close.
  const closeExamine = useCallback(() => setExamineResult(null), []);
  const closeSuspects = useCallback(() => setShowSuspects(false), []);
  const closeAccuse = useCallback(() => setShowAccuse(false), []);

  // Clear any in-flight hotspot search (timers + searching sfx).
  const finishSearch = useCallback(() => {
    const s = searchRef.current;
    if (s) { clearTimeout(s.timer); clearTimeout(s.safety); searchRef.current = null; }
    stopSearching();   // stop the looping rustle (no-op if not playing)
  }, []);

  // Commit the examination: hit the server, then open the result modal.
  const doExamine = useCallback(async (hotspotId) => {
    finishSearch();
    setExamining(null);
    const res = await net.examine(hotspotId);
    if (!res?.ok) return flash(res?.error || "Can't examine that.");
    setExamineResult(res);
    if (res.found) {
      playClueFound();   // brief ding on a discovered clue
      flash("Evidence found!");
      pushChat({ who: "System", color: "#f0b85c", kind: "clue", text: `You examined ${res.hotspotName} and found evidence:` });
      pushChat({ who: "Clue", color: "#f0b85c", kind: "clue", text: res.clue.text });
    } else {
      playNothingFound();   // soft whoosh on an empty hotspot
      pushChat({ who: "System", color: "#9ad6a0", kind: "system", text: `You examined ${res.hotspotName} — nothing of interest.` });
    }
  }, [finishSearch, flash, pushChat]);

  // Start the 2.5s "searching" state, then commit. Reduced-motion users skip
  // straight to the result. One search at a time; never while a result is up.
  const handleExamine = useCallback((hotspotId) => {
    if (searchRef.current || examineResult) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced) { doExamine(hotspotId); return; }
    setExamining({ hotspotId, startTime: Date.now() });
    playSearching();   // looping rustle for the duration of the search
    const timer = setTimeout(() => doExamine(hotspotId), SEARCH_MS);
    // Defensive: if the searching state ever wedges, force-reset after 5s.
    const safety = setTimeout(() => { finishSearch(); setExamining(null); }, 5000);
    searchRef.current = { timer, safety };
  }, [doExamine, examineResult, finishSearch]);

  // Cancel any in-flight search if the component unmounts.
  useEffect(() => finishSearch, [finishSearch]);

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
    playAccusationLockIn();   // dramatic sting on the "LOCKED IN — awaiting opponent" moment
    flash("Accusation locked — awaiting opponent's accusation…");
    return res;
  }, [flash]);

  const backToLobby = useCallback(() => {
    finishSearch();
    // Tell the server we're out. Without this the GameRoom kept running: its soft
    // cap would later fire and push a `game:reveal` at us in the lobby / next
    // game, and the opponent was never told their rival had walked away.
    inGameRef.current = false;
    net.leaveRoom();
    setReveal(null); setView(null); setShowAccuse(false); setExamineResult(null); setExamining(null);
    setShowSuspects(false); setDialogues({}); setChat([]); setRegion(null);
    setShowActivity(false); setShowNotebook(false); setShowMenu(false);
  }, [finishSearch]);

  // Accusation timing (derived each heartbeat).
  const acc = view?.accusation;
  const serverNow = Date.now() + clockOffset.current;
  const youLocked = Boolean(acc?.youLocked);
  const gateMsLeft = acc?.opensAt ? acc.opensAt - serverNow : 0;
  const canAccuse = view?.status === "playing" && !youLocked && gateMsLeft <= 0;
  // Timer: Off ships softMs as null. Everything downstream reads "no deadline",
  // NOT "deadline of zero" — treating null as 0 would put gameEndAt at startedAt,
  // freeze the pill at ACCUSE (0:00) and fire the urgency visuals immediately.
  const noLimit = acc?.softMs == null && !acc?.finalDeadline;
  // Time left to actually ACT: the final window if open, else the soft game-end.
  const gameEndAt = acc?.startedAt
    ? acc.finalDeadline || (acc.softMs == null ? 0 : acc.startedAt + acc.softMs)
    : 0;
  const actMsLeft = gameEndAt ? Math.max(0, gameEndAt - serverNow) : 0;
  // ONE urgency state: the final minute. Calm green before, red visuals after —
  // no banners, no continuous sound (just a 3-second tick burst at the 1:00 mark).
  const urgent = view?.status === "playing" && Boolean(acc?.startedAt) && !noLimit
    && actMsLeft > 0 && actMsLeft <= 60_000;
  const accuseUrgent = canAccuse && urgent;
  const accuseLabel = youLocked
    ? "LOCKED IN ✓"
    : gateMsLeft > 0
      ? `OPENS (${fmtMs(gateMsLeft)})`
      : noLimit
        ? "ACCUSE"
        : `ACCUSE (${fmtMs(actMsLeft)})`;

  // Toast (no sound) the moment the accusation window opens — informational only.
  // Skipped when the host set the gate to 0, since "the window is now open" the
  // instant the game begins is noise, not news.
  useEffect(() => {
    if (canAccuse && !accuseAnnounced.current) {
      accuseAnnounced.current = true;
      if (acc?.opensAt && acc.opensAt > acc.startedAt) {
        flash("Accusation window open — you may now accuse.");
      }
    }
  }, [canAccuse, acc?.opensAt, acc?.startedAt, flash]);

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
    playTickBurst();   // one-shot ~3s mp3; let it play through, no repeat
  }, [urgent]);

  const handleAction = useCallback((key) => {
    if (youLocked) return flash("You've locked in — you can walk, but not investigate.");
    if (examining) return flash("Searching…");
    if (key === "QUESTION SUSPECT") return setShowSuspects(true);
    if (key === "ACCUSE") {
      if (canAccuse) return setShowAccuse(true);
      return flash(`Accusations open in ${fmtMs(gateMsLeft)}.`);
    }
    flash("Coming soon.");
  }, [flash, canAccuse, youLocked, gateMsLeft, examining]);

  const openActivity = useCallback(() => {
    setShowActivity(true); setSeen(chat.length); setPingDot(false); setShowMenu(false);
  }, [chat.length]);

  if (reveal) {
    return (
      <RevealScreen
        reveal={reveal}
        me={view?.you?.character}
        onPlayAgain={backToLobby}
        onMainMenu={() => { backToLobby(); setPhase("menu"); }}
      />
    );
  }
  if (!view || view.status === "lobby") {
    // Pre-game screens share ONE living backdrop (same tree position across
    // menu ⇄ lobby, so React never remounts it — the scene never resets). It
    // unmounts only when the game starts or the reveal takes over.
    return (
      <div className="pre-game">
        <MenuBackdrop />
        {atMenu ? (
          <MainMenu onBegin={() => setPhase("lobby")} soundOn={soundOn} onToggleSound={() => setSoundOn((s) => !s)} />
        ) : (
          <Lobby onError={flash} onBack={() => setPhase("menu")} />
        )}
      </div>
    );
  }

  const me = view.you.character;

  // The case file, once, before the board. It sits between the lobby branch above
  // and the game tree below rather than becoming a fourth `phase` value, because
  // "playing" has always been derived from the server view rather than stored.
  if (view.status === "playing" && !briefed) {
    return (
      <CaseBriefing
        caseInfo={view.caseInfo}
        settings={view.settings}
        onBegin={() => setBriefed(true)}
      />
    );
  }

  // Current region: local movement is authoritative for UI; fall back to server.
  const curRoom = region?.room ?? view.you.room;
  const inCorridor = region?.inCorridor ?? view.you.inCorridor ?? false;
  const modalOpen = showSuspects || showAccuse || Boolean(examineResult);
  modalOpenRef.current = modalOpen;   // read by the always-mounted map key handler
  const unread = Math.max(0, chat.length - seen);

  return (
    <div className="app">
      {/* ===== The race scoreboard: you | the clock | your rival ===== */}
      <div className="hud-bar">
        <PlayerHud
          name={view.you.name}
          character={me}
          color={COLOR[me]}
          roomLabel={roomLabelOf(curRoom)}
          inCorridor={inCorridor}
          lockedIn={youLocked}
          clueCount={view.you.clueCount}
          total={view.progressTotal}
        />
        <TimerBar accusation={acc} serverNow={serverNow} />
        <RivalHud
          rival={view.opponent}
          total={view.progressTotal}
          hideProgress={view.settings?.rivalProgress === false}
        />

        <div className="hud-tools">
          <button className={`hud-tool ${pingDot ? "ping" : ""}`} onClick={openActivity} title="Activity log">
            📜 <span className="ht-label">Activity</span>
            {unread > 0 && <span className="ht-badge">{unread}</span>}
          </button>
          <button className={`hud-tool ${showNotebook ? "on" : ""}`} data-sound="off" onClick={() => { playNotebookOpen(); setShowNotebook((v) => !v); setShowMenu(false); }} title="Notebook">
            📓 <span className="ht-label">Notebook</span>
          </button>
          <button className={`hud-tool ${showMap ? "on" : ""}`} onClick={() => setShowMap((v) => !v)} title="Manor map (M)">
            🗺 <span className="ht-label">Map</span>
          </button>
          <button className={`hud-tool icon ${showMenu ? "on" : ""}`} onClick={() => { setShowMenu((v) => !v); }} title="Menu" aria-label="Menu">☰</button>
        </div>
      </div>

      {/* ===== Stage: the board is the hero, with the strip beneath it and the
          suspect rail alongside. One grid, one 12px gutter — the rail's top edge
          lines up with the board's because they share a grid row, not because
          anything was measured. ===== */}
      <div className="stage">
        <main className="board-hero">
          <BoardCanvas
            me={me}
            startRoom={view.you.room}
            showReachable={showHints}
            /* Movement stays live after lock-in — you can pace the manor while your
               rival finishes. Every ACTION is still shut off (ActionBar `locked`
               below, and the server refuses examine/question regardless). */
            inputEnabled={!modalOpen && !examining}
            sprintEnabled={view.settings?.sprint !== false}
            showMarkers={view.settings?.hotspotMarkers !== false}
            examined={view.you.examinedHotspots || []}
            searchingId={examining?.hotspotId || null}
            searchingStart={examining?.startTime || null}
            onExamine={handleExamine}
            onRegionChange={handleRegionChange}
          />

          {/* The pills float INSIDE the board: they act on your detective, so they
              belong where your detective is, and a separate band would make a
              fourth horizontal stripe on an already busy page. */}
          <ActionBar
            showHints={showHints}
            accuseLabel={accuseLabel}
            canAccuse={canAccuse}
            accuseUrgent={accuseUrgent}
            locked={youLocked}
            onToggleHints={() => setShowHints((s) => !s)}
            onAction={handleAction}
          />

          {toast && <div className="toast">{toast}</div>}
          {/* Final-minute urgency: subtle RED glow at the screen edges (not the centre) */}
          {urgent && <div className="vignette-edges" aria-hidden="true" />}
        </main>

        <TabStrip
          open={openTab}
          onToggle={setOpenTab}
          caseInfo={view.caseInfo}
          settings={view.settings}
          lines={chat}
          askedCount={Object.values(view.you.questioning || {}).reduce((n, q) => n + (q?.asked || 0), 0)}
          questionCap={QUESTION_CAP}
        />

        <aside className="suspect-rail">
          <div className="rail-head">SUSPECTS</div>
          {(view.caseInfo?.suspects || []).map((sus, i) => (
            <SuspectCard
              key={sus.id}
              suspect={sus}
              index={i}
              status={marks[`suspect:${sus.id}`] || "unknown"}
              onCycle={(id, next) => setMarks((m) => ({ ...m, [`suspect:${id}`]: next }))}
              onQuestion={() => handleAction("QUESTION SUSPECT")}
            />
          ))}
        </aside>
      </div>

      {/* ===== Slide-in panels (do not cover the board during normal play) ===== */}
      <ActivityLog open={showActivity} lines={chat} onClose={() => setShowActivity(false)} />

      {showNotebook && (
        <aside className="notebook-sidebar">
          <div className="panel-head">
            <span>NOTEBOOK</span>
            <button className="panel-x" data-sound="off" onClick={() => { playNotebookOpen(); setShowNotebook(false); }} aria-label="Close">×</button>
          </div>
          <DeductionNotebook
            caseInfo={view.caseInfo}
            foundClues={view.you.foundClues}
            examinedHotspots={view.you.examinedHotspots || []}
            marks={marks}
            onMark={(key, next) => setMarks((m) => ({ ...m, [key]: next }))}
          />
        </aside>
      )}

      <MapOverlay
        open={showMap}
        /* No room/inCorridor prop: the map reads the LIVE position itself, so it
           stays right in the corridor instead of still naming the room you left. */
        roomLabel={roomLabelOf(curRoom)}
        examined={view.you.examinedHotspots || []}
        onClose={() => setShowMap(false)}
      />

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
          onClose={closeSuspects}
        />
      )}

      {showAccuse && (
        <AccusationModal
          caseInfo={view.caseInfo}
          foundClues={view.you.foundClues}
          onSubmit={submitAccusation}
          onClose={closeAccuse}
        />
      )}

      {examineResult && (
        <ExamineModal result={examineResult} onClose={closeExamine} />
      )}
    </div>
  );
}
