import { suspectChip } from "./suspectStyle.js";

// The case as the detectives are told it: victim, opening, backstory, cast, rules.
//
// All of this has been travelling to the client inside `caseInfo` since the very
// first build and was rendered nowhere — players started a murder mystery with no
// idea who had died or why. This component is deliberately the ONLY place it is
// laid out, so the opening cinematic and the in-game Scenario tab can never drift.
//
// `reveal` is how the cinematic drives it. Omit it and everything renders at once,
// which is what the Scenario tab wants on a re-read; pass one and this renders a
// partially-typed state instead. The markup is identical either way, so nothing
// re-flows when the typing finishes.
export default function CaseBriefingBody({ caseInfo, settings, compact = false, reveal = null }) {
  const suspects = caseInfo?.suspects || [];
  const opening = caseInfo?.opening || "";
  const backstory = caseInfo?.victimBackstory || "";

  const full = !reveal;
  const shownOpening = full ? opening : opening.slice(0, reveal.opening);
  const shownBack = full ? backstory : backstory.slice(0, reveal.backstory);
  const castCount = full ? suspects.length : reveal.cast;
  const showBack = Boolean(backstory) && (full || reveal.backstory > 0 || reveal.cast > 0 || reveal.rules);
  const showCast = full || reveal.cast > 0;
  const showRules = Boolean(settings) && (full || reveal.rules);
  const caret = (which) => !full && reveal.caret === which && <span className="mm-caret" />;

  return (
    <div className={`brief ${compact ? "compact" : ""}`}>
      <div className="brief-victim">
        <span className="brief-label">The deceased</span>
        <span className="brief-name">{caseInfo?.victimName || "Unknown"}</span>
      </div>

      {opening && <p className="brief-opening">{shownOpening}{caret("opening")}</p>}

      {showBack && (
        <>
          <span className="brief-label">What is known of him</span>
          <p className="brief-back">{shownBack}{caret("backstory")}</p>
        </>
      )}

      {showCast && (
        <>
          <span className="brief-label">Under this roof tonight</span>
          <ul className="brief-cast">
            {suspects.slice(0, castCount).map((s, i) => {
              const chip = suspectChip(i);
              return (
                <li key={s.id} className={full ? "" : "cast-in"}>
                  <span className="brief-chip" style={{ background: chip.color }}>{chip.label}</span>
                  <span className="brief-cast-name">{s.name}</span>
                  <span className="brief-cast-role">{s.role}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {showRules && (
        <>
          <span className="brief-label">This investigation</span>
          <ul className="brief-rules">
            <li>{settings.softTimer == null ? "No time limit — the case stays open until someone accuses." : `Time limit: ${Math.round(settings.softTimer / 60)} minutes.`}</li>
            <li>{settings.hotspotMarkers === false ? "No hotspot markers — you'll have to spot what's searchable yourself." : "Searchable furniture is marked."}</li>
            <li>{settings.rivalProgress === false ? "Your rival's progress is hidden." : "You can see how many clues your rival has found."}</li>
          </ul>
        </>
      )}
    </div>
  );
}
