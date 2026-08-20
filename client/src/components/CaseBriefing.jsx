import { useEffect, useRef, useState } from "react";
import CaseBriefingBody from "./CaseBriefingBody.jsx";

// The case file, told rather than displayed.
//
// The whole screen goes black and the story TYPES itself out — victim, then what
// happened, then what is known of him, then the six faces under the roof, one at a
// time. It is the first thing a player sees of a murder mystery, and a wall of text
// appearing instantly reads like a EULA; typed, it reads like a case being opened.
// The storm bed is already playing underneath — App's `ambient` covers the whole
// "playing" status, which includes this screen — so it is quiet, not silent.
//
// The reveal is driven THROUGH CaseBriefingBody rather than by re-implementing the
// layout here, so the cinematic and the in-game Scenario tab cannot drift apart.
//
// The clock is ALREADY RUNNING behind this: the server starts the game the moment
// the second player joins, and gating that on both detectives acknowledging a screen
// would mean a new intent, a both-ready gate and a stall path if one of them wandered
// off — a real protocol change for ceremony. So it says so, and dismisses itself
// rather than letting an idle player lose the game to a modal.
//
// Everything is skippable: reduced motion renders it complete, and any key or click
// fast-forwards. Nobody should be held hostage by an animation, least of all on a
// second playthrough.
const TYPE_MS = 18;          // per character
const BEAT_MS = 420;         // pause between sections
const CAST_MS = 260;         // stagger between faces
const AUTO_DISMISS_MS = 60_000;

const STEP = { OPENING: 0, BACKSTORY: 1, CAST: 2, DONE: 3 };

export default function CaseBriefing({ caseInfo, settings, onBegin }) {
  const suspects = caseInfo?.suspects || [];
  const opening = caseInfo?.opening || "";
  const backstory = caseInfo?.victimBackstory || "";

  const reduced = useRef(
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  ).current;

  const [step, setStep] = useState(reduced ? STEP.DONE : STEP.OPENING);
  const [chars, setChars] = useState(0);
  const [cast, setCast] = useState(reduced ? suspects.length : 0);
  const [left, setLeft] = useState(Math.ceil(AUTO_DISMISS_MS / 1000));

  const done = step === STEP.DONE;
  const skip = () => { setStep(STEP.DONE); setCast(suspects.length); };

  // Type the current block, beat, then move on.
  useEffect(() => {
    if (step > STEP.BACKSTORY) return;
    const text = step === STEP.OPENING ? opening : backstory;
    if (!text) { setStep((s) => s + 1); setChars(0); return; }
    if (chars >= text.length) {
      const t = setTimeout(() => { setStep((s) => s + 1); setChars(0); }, BEAT_MS);
      return () => clearTimeout(t);
    }
    const id = setInterval(() => setChars((c) => c + 1), TYPE_MS);
    return () => clearInterval(id);
  }, [step, chars, opening, backstory]);

  // Then the cast, one face at a time, then the rules.
  useEffect(() => {
    if (step !== STEP.CAST) return;
    if (cast >= suspects.length) {
      const t = setTimeout(() => setStep(STEP.DONE), BEAT_MS);
      return () => clearTimeout(t);
    }
    const id = setInterval(() => setCast((n) => Math.min(suspects.length, n + 1)), CAST_MS);
    return () => clearInterval(id);
  }, [step, cast, suspects.length]);

  // Any key fast-forwards. Deliberately does NOT begin the game: this screen costs
  // you clock, but walking into the manor stays a decision you make on purpose.
  useEffect(() => {
    if (done) return;
    const onKey = () => skip();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, suspects.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tick = setInterval(() => setLeft((s) => s - 1), 1000);
    const bail = setTimeout(() => onBegin?.(), AUTO_DISMISS_MS);
    return () => { clearInterval(tick); clearTimeout(bail); };
  }, [onBegin]);

  const reveal = done ? null : {
    opening: step === STEP.OPENING ? chars : opening.length,
    backstory: step === STEP.BACKSTORY ? chars : step > STEP.BACKSTORY ? backstory.length : 0,
    cast,
    rules: false,
    caret: step === STEP.OPENING ? "opening" : step === STEP.BACKSTORY ? "backstory" : null,
  };

  return (
    <div className="briefing-screen" onClick={done ? undefined : skip}>
      <div className="briefing-reel">
        <div className="briefing-head">
          <span className="briefing-case">CASE Nº {caseInfo?.caseId || "—"}</span>
          <span className="briefing-clock">The clock is already running · {Math.max(0, left)}s</span>
        </div>

        <CaseBriefingBody caseInfo={caseInfo} settings={settings} reveal={reveal} />

        {done ? (
          <button className="lb-btn primary briefing-go" onClick={onBegin}>Enter the Manor</button>
        ) : (
          <span className="briefing-skip">Press any key to skip</span>
        )}
      </div>
    </div>
  );
}
