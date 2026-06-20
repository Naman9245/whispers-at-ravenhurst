// The [☰] menu dropdown: a sound toggle, a brief How-to-Play, and Exit Game.
// Slides down from the HUD's far-right; a transparent scrim closes it on outside
// click. Room code lives here too (kept off the board for the minimalist layout).
export default function GameMenu({ open, soundOn, roomCode, devMode, onToggleSound, onExit, onClose }) {
  if (!open) return null;
  return (
    <>
      <div className="panel-scrim" onClick={onClose} />
      <div className="game-menu" role="menu">
        <div className="panel-head">
          <span>MENU</span>
          <button className="panel-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <button className="menu-item" onClick={onToggleSound}>
          <span>Sound</span>
          <b className={soundOn ? "on" : "off"}>{soundOn ? "ON" : "OFF"}</b>
        </button>

        <div className="menu-section">
          <div className="menu-label">How to Play</div>
          <ol className="menu-help">
            <li>Move with <b>WASD / arrows</b>; enter rooms through their doorways.</li>
            <li><b>Investigate</b> rooms for clues; <b>Question</b> suspects for testimony.</li>
            <li>Mark suspects, weapons &amp; rooms in your <b>Notebook</b> as you deduce.</li>
            <li>When <b>Accuse</b> opens, name culprit + weapon + room and <b>lock in</b>.</li>
          </ol>
        </div>

        <button className="menu-item danger" onClick={onExit}>Exit Game</button>
        <div className="menu-foot">Room {roomCode}{devMode ? " · DEV MODE" : ""}</div>
      </div>
    </>
  );
}
