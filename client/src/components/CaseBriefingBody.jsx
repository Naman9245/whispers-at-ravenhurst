import { suspectChip } from "./suspectStyle.js";

// The case as the detectives are told it: victim, opening, backstory, cast.
//
// All of this has been travelling to the client inside `caseInfo` since the very
// first build and was rendered nowhere — players started a murder mystery with no
// idea who had died or why. This component is deliberately the ONLY place it is
// laid out, so the full-screen briefing and the in-game Scenario tab can never
// drift apart.
export default function CaseBriefingBody({ caseInfo, settings, compact = false }) {
  const suspects = caseInfo?.suspects || [];

  return (
    <div className={`brief ${compact ? "compact" : ""}`}>
      <div className="brief-victim">
        <span className="brief-label">The deceased</span>
        <span className="brief-name">{caseInfo?.victimName || "Unknown"}</span>
      </div>

      {caseInfo?.opening && <p className="brief-opening">{caseInfo.opening}</p>}

      {caseInfo?.victimBackstory && (
        <>
          <span className="brief-label">What is known of him</span>
          <p className="brief-back">{caseInfo.victimBackstory}</p>
        </>
      )}

      <span className="brief-label">Under this roof tonight</span>
      <ul className="brief-cast">
        {suspects.map((s, i) => {
          const chip = suspectChip(i);
          return (
            <li key={s.id}>
              <span className="brief-chip" style={{ background: chip.color }}>{chip.label}</span>
              <span className="brief-cast-name">{s.name}</span>
              <span className="brief-cast-role">{s.role}</span>
            </li>
          );
        })}
      </ul>

      {settings && (
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
