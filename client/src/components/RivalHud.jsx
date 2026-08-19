import CluePips from "./CluePips.jsx";

// Right end of the top bar: the other detective, mirrored against your own block
// on the left. The bar is the game's scoreboard — two detectives, one race — and
// mirroring is what makes it read that way rather than as a row of labels.
//
// Everything here already crosses the privacy boundary in buildView(): a name, a
// character, a normalised clue COUNT, and two flags. No position, no clues.
//
// The status line matters more than it looks. A rival locking in is the tensest
// moment in the game and it used to be a toast that vanished after two seconds.
export default function RivalHud({ rival, total, hideProgress = false }) {
  if (!rival) {
    return (
      <div className="hud-sec hud-rival empty">
        <span className="rv-waiting">Awaiting your partner detective…</span>
      </div>
    );
  }

  const status = !rival.connected ? "Disconnected" : rival.lockedIn ? "LOCKED IN" : "Investigating";
  const statusClass = !rival.connected ? "gone" : rival.lockedIn ? "locked" : "";

  return (
    <div className="hud-sec hud-rival">
      <CluePips count={rival.clueCount} total={total} color="#a78bd0" hidden={hideProgress} />
      <div className="rv-id">
        <span className="rv-name">{rival.name}</span>
        <span className={`rv-status ${statusClass}`}>{status}</span>
      </div>
      <span className="hud-avatar rival" aria-hidden="true">
        <img src={`/assets/${rival.character}/rotations/south.png`} alt="" />
      </span>
    </div>
  );
}
