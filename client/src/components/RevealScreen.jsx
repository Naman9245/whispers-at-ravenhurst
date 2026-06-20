// Game-end reveal. Shows the truth, the AI-written solution monologue, both
// detectives' accusations side-by-side with their score breakdowns, and the
// winner. Everything here arrives in the single `game:reveal` payload — the
// solution was never on the client until this moment.

const COLOR = { holmes: "#6fd6c4", watson: "#f0b85c" };

function Verdict({ ok }) {
  return <span className={`verdict ${ok ? "right" : "wrong"}`}>{ok ? "✓" : "✗"}</span>;
}

export default function RevealScreen({ reveal, me, onPlayAgain, onMainMenu }) {
  const { solution, monologue, players, winners } = reveal;
  const youWon = winners.includes(me);
  const tie = winners.length > 1;

  const headline = winners.length === 0
    ? "No one cracked the case."
    : tie ? "A draw — both detectives prevail." : youWon ? "You cracked the case." : "Bested. The other detective saw it first.";

  return (
    <div className="reveal-screen">
      <div className="reveal-inner">
        <div className={`reveal-banner ${winners.length && (youWon || tie) ? "win" : "lose"}`}>{headline}</div>

        <div className="reveal-solution">
          <div className="rs-title">THE TRUTH OF RAVENHURST</div>
          <div className="rs-triple">
            <b style={{ color: "#d88" }}>{solution.culpritName}</b>, in the{" "}
            <b style={{ color: "#9cd" }}>{solution.roomLabel}</b>, with the{" "}
            <b style={{ color: "#dca" }}>{solution.weaponName}</b>.
          </div>
          <p className="rs-monologue">{monologue}</p>
          {solution.motive && <p className="rs-motive">Motive: {solution.motive}</p>}
        </div>

        <div className="reveal-players">
          {players.map((p) => {
            const a = p.accusation;
            return (
              <div key={p.character} className={`reveal-card ${winners.includes(p.character) ? "winner" : ""}`}>
                <div className="rc-head" style={{ color: COLOR[p.character] }}>
                  {p.name}{p.character === me ? " (you)" : ""}
                  {winners.includes(p.character) && <span className="rc-crown">★</span>}
                </div>

                {p.forfeited ? (
                  <div className="rc-forfeit">Forfeited — no accusation submitted.</div>
                ) : (
                  <ul className="rc-accusation">
                    <li><Verdict ok={a.culpritId === solution.culpritId} /> {a.culpritName}</li>
                    <li><Verdict ok={a.weaponId === solution.weaponId} /> {a.weaponName}</li>
                    <li><Verdict ok={a.roomId === solution.roomId} /> {a.roomLabel}</li>
                  </ul>
                )}

                <div className="rc-score">
                  <div className="rcs-row"><span>Base (culprit/weapon/room)</span><b>{p.score.base}</b></div>
                  <div className="rcs-row"><span>Reasoning (evidence cited)</span><b>+{p.score.reasoning}</b></div>
                  <div className="rcs-row"><span>Speed</span><b>+{p.score.speed}</b></div>
                  <div className="rcs-row total"><span>Total</span><b>{p.score.total}</b></div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="reveal-actions">
          <button className="lb-btn primary" onClick={onPlayAgain}>Play Again</button>
          <button className="lb-btn ghost" onClick={onMainMenu}>Main Menu</button>
        </div>
      </div>
    </div>
  );
}
