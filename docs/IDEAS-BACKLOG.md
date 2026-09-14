# Ideas Backlog — Whispers at Ravenhurst

> Brainstorm dump, not a commitment. **Last updated:** 2026-08-20
> Sorted by *impact per hour of work*, not by how cool it sounds.
> Nothing here overrides the "Critical Design Decisions" in [CLAUDE.md](../CLAUDE.md) —
> if an idea contradicts one of those, it needs an explicit approval first.

---

## 0. Where we stand (be honest about it)

The game already has the three hardest things done: a **server-authoritative rules
engine**, a **real deduction loop** (hotspot → clue → interrogation → confront →
accuse), and **presentation** (cinematic menu, briefing, camera, storm audio).

What it does **not** have yet, and what every idea below is really about:

| Gap | Symptom |
|---|---|
| **Content depth** | One fallback case. Second playthrough = you already know the killer. |
| **Drama beats** | The middle 10 minutes are quiet. No spikes, no "oh shit" moment. |
| **The rival is invisible** | It's a race, but you barely *feel* the other detective. |
| **No payoff archive** | You solve it, you see a screen, it's gone. Nothing to keep or share. |
| **No reason to return** | No progression, no daily, no "one more case". |

---

## 1. Design principles worth stealing (from games that nailed it)

These are the rules I'd hold the whole backlog against.

1. **"Everything you need is on the screen."** Murdle's rule — already adopted in 2.8.
   Keep enforcing it: any new clue type must be *checkable* against something printed.
2. **The "Aha" must be earned, never given.** *Golden Idol* / *Obra Dinn*: the game
   never says "so X is innocent". It says "the knot was pulled left" and lets **you**
   cross names off. We already reversed the answer-key clues in 2.8 — don't regress.
3. **Procedural mysteries fail by being *thin*, not by being unsolvable.**
   *Shadows of Doubt*'s complaint isn't "too hard", it's "every case feels the same
   and has fewer clues than a hand-made one". Lesson for Phase 3's live generation:
   **generate the skeleton, hand-author the flavour library.** Motives, twists,
   confessions, dossier lines = human-written pools the AI *selects and dresses*,
   not free-form prose every time.
4. **Test the mystery on real humans, early.** Golden Idol's devs credit frequent
   playtesting for the difficulty curve. We need a 5-person playtest form, not vibes.
5. **A detective game is a *notebook* game.** The moment-to-moment fun is crossing
   things off. Anything that makes the notebook better beats anything that makes the
   mansion prettier.

---

## 2. S-Tier — do these next (high impact, days not weeks)

### 2.1 "How you could have known" — the solvability replay ⭐ flagship
At the reveal, after the winner is announced, show a **step-by-step deduction chain**:

> 🔎 The mud on the boot scraper → Vale said he never left the house →
> confronted, he admitted the garden → **only Vale was outside during the storm.**
> 🔎 The wound was a puncture, not a cut → of the three left, only one weapon is
> BLADE-type → the letter opener is out.

Why it's the single best idea here: it turns a loss into a lesson, it *proves* the
case was fair, and it's the most screenshot-able thing in the whole game for a
portfolio. Technically cheap: the server already knows `clue.eliminates` and the
solution — it's a walk over the elimination graph, rendered as a timeline.

### 2.2 The rival, made visible (dramatic pressure)
Right now the rival is a number in the top bar. Make the race *felt*, without
leaking privacy (`buildView` stays the boundary):

- **"Somewhere in the manor, a door closes."** — when the rival finds a clue, a
  faint creak + a one-line activity log. No room name, no position.
- **Rival heartbeat bar** — a subtle red pulse behind their clue pips that speeds up
  as they approach the clue count needed to accuse.
- **"Your rival is questioning someone."** — a status verb, not a place.
- **Lock-in shockwave** — when the rival locks in, the screen desaturates for 400ms,
  the rain gets louder, and the timer flips to the final window with a bang.
  (Asset already exists: `accusation_lockin.mp3`.)

### 2.3 Case archive + shareable result card
- After every game, save a **case file** to `localStorage`: crest, case name, killer,
  weapon, room, your time, win/loss, clue count.
- The **Case Files** panel (already exists for credits) grows a "Solved Cases" shelf.
- A **Wordle-style share string** — the thing that actually spreads a game:

  ```
  Whispers at Ravenhurst — Case #0041 "The Locked Conservatory"
  Solved in 11:42 · Clues 6/7 · Won the race
  ```

  Copy-to-clipboard button. Zero backend cost, huge word-of-mouth per hour spent.

### 2.4 Three difficulty *shapes* (not just three timers)
Host settings already exist — add a **Case Difficulty** dial that changes the
*puzzle*, not the clock:
- **Constable** — 6 suspects, fewer clues needed, one clue is nearly a giveaway,
  hotspot markers on.
- **Inspector** — current design.
- **Chief Inspector** — 8 suspects, a **second liar** among the innocents, one clue is
  a deliberate red herring that *looks* eliminating, no hotspot markers.

### 2.5 The tension curve — scripted mid-game beats
The middle is flat. Give the manor a schedule (server-authoritative, both players see it):
- **~40% time:** the lights flicker and one room goes dark (examining there costs +1.5s).
- **~60% time:** *"A scream from the east wing."* A **new hotspot spawns** — a second
  piece of evidence appears where there was nothing before.
- **~80% time:** the storm peaks; the map overlay goes unreliable for 20s.

Each beat is a log line + an audio sting + one mechanical change. Cheap, and it turns
"searching furniture" into "a night that keeps getting worse".

---

## 3. A-Tier — strong, medium cost

### 3.1 Deduction mechanics
- **The Murdle grid.** A proper suspect × weapon × room elimination grid in the
  notebook, with ✓/✗/? and **auto-cross-off propagation** (mark a row, the column
  updates). The single most requested feature in every deduction game ever.
- **Clue combination.** Drag clue A onto clue B in the notebook → if they're a
  designed pair, you get a *derived* insight ("mud + the broken latch = he came back
  IN through the conservatory"). A handful of authored pairs per case.
- **Confidence-weighted accusation.** Let the player mark *why* they accuse (pick two
  clues as their proof). Correct killer + correct proof = full score; correct killer,
  wrong proof = "a lucky guess" and fewer points. Rewards reasoning over a 1-in-6
  gamble. Scoring hooks already exist: base + reasoning + speed.
- **Alibi web.** Suspects reference *each other* ("I was with Lady Ashcombe at nine").
  Break one alibi and it collapses two stories. Turns interrogation into a graph.
- **The one wrong accusation.** Optionally allow a *first* accusation that, if wrong,
  costs three minutes and tells the rival you failed. High-drama gamble.

### 3.2 Multiplayer shapes beyond the 1v1 race
- **Duo co-op vs. the clock** — 2 players, *shared* clue pool, split rooms, must agree
  on the accusation. Different social experience, near-zero new art.
- **Detective vs. Culprit (asymmetric)** — one player secretly IS the murderer, roams
  the manor, and can **tamper** with one hotspot (destroy evidence, plant a herring)
  at the cost of leaving a trace. This is the mode that gets streamed.
- **4-player, 2 teams** — same board, two racing pairs.
- **Spectator / ghost of the victim** — a third connection watches both boards live.
  Great for demoing the game to a recruiter without them playing it.

### 3.3 Interrogation drama
- **Suspects react to being caught.** After a `brokenBy` confront: the portrait
  sweats, the card border goes red, the text stutters as it types. The collapse of a
  lie is the best moment in the game and right now it is silent.
- **Pressure meter per suspect.** Ask too many hostile questions and they clam up —
  a real cost attached to the free clue-unlocked questions.
- **One suspect is genuinely helpful** — the butler who noticed everything but answers
  only if you ask the *right* question. Rewards reading the dossier.

### 3.4 Presentation / drama (all canvas, no new engine)
- **Lightning that lights the room you're standing in** — a 120ms white flash that
  throws long furniture shadows away from the window. The lightning system already
  exists in `menuScene.js`; port it to the board.
- **The victim's chalk outline** in the murder room, with a slow red pulse.
- **Letterboxed cutscene bars** for game start, the mid-game beat, the lock-in and the
  reveal. Two black bars = instant cinema, ~15 lines of CSS.
- **The reveal as a newspaper front page** — *THE RAVENHURST HERALD*, headline built
  from the outcome ("BUTLER CHARGED — Detective Rao cracks it in eleven minutes"),
  the losing detective in a smaller column. This is the shareable image.
- **A portrait pass on suspects** — the cards are pure typography today. Even
  1-bit / engraved-woodcut portraits would multiply the perceived production value.
  Generate at build time, ship as static PNGs.
- **Camera drama** — on reveal, fly the camera to the murder room and zoom on the
  weapon. The 2.8 camera already supports it.

---

## 4. Story content — the part that decides if people play twice

### 4.1 The case archetype library (build this, then let the AI fill it in)
Golden-Age + true-crime structures that are *mechanically* different, not re-skins:

| # | Archetype | The twist it enables |
|---|---|---|
| 1 | **The insurance play** | Motive hides in paperwork — a clue is a *document*, not an object. The Ardlamont-style "policy taken out days before the accident" pattern. |
| 2 | **The staged accident** | The murder is disguised as a fall or a fire. Half the clues prove *it wasn't an accident* before you can even ask who. |
| 3 | **The locked room** | Access is the whole puzzle — the killer is whoever *could* have got in. Leans hard on the map. |
| 4 | **The impostor guest** | One suspect isn't who their card says. Their dossier attributes are the lie. |
| 5 | **The wrong victim** | The poison was meant for someone else — motive points at a person who is still alive. |
| 6 | **The property dispute** *(very Crime Patrol)* | Family, inheritance, a signature. The motive is boring and domestic, which makes it believable. |
| 7 | **The servant nobody looked at** | The class blind spot. Clues exist that nobody checked because "he's only the footman". |
| 8 | **Two crimes, one night** | A theft and a murder happened; half your clues belong to the *wrong* crime. Brutal — needs the difficulty dial. |
| 9 | **The false confession** | Someone confesses early to protect another. Accusing them is a trap. |
| 10 | **The letter that arrived late** | A timeline puzzle — the clue is *when*, not *what*. |

### 4.2 Crime Patrol as a *structural* teacher (not a source to copy)
What that show actually does well, and what ports:

- **Cold open on the ordinary.** It always starts with a normal evening — tea, a
  wedding, a phone call — and *then* the crime. Our briefing already types the story
  out; open it on a mundane, warm scene so the murder lands harder.
- **The narrator's moral frame.** A calm voice explaining how a small greed became a
  body. Port it as a **narrator line at the reveal**: one sentence on *why* it
  happened. ("A house worth forty lakh. That is all it took.") Emotion beats mechanics
  at the end.
- **Motive is always domestic.** Property, a love triangle, debt, shame, a promotion —
  not criminal masterminds. Our motive pool should look like this; it's what makes a
  case feel real instead of like a board game.
- **The reconstruction.** After the reveal, show *the crime as it happened* — a short
  animated walk-through on the board: the killer's path, room to room, timestamped.
  That's the Crime Patrol payoff, and we already have pathfinding plus a camera.

> ⚠️ **Guardrail.** Use the *structure* and the *motive patterns*. Do **not** dramatise
> a specific real case with real names, and don't reproduce episode scripts — that's
> someone's actual tragedy and someone else's copyright. Historical public-domain
> cases (Road Hill House, Ardlamont, the Whitechapel *atmosphere*) are fine as
> **inspiration for a fictional case**, and even then rename everyone. A portfolio
> piece should never need a disclaimer.

### 4.3 A map that isn't another English manor
Maps 2 and 3 are planned as Moonlight Hotel and Blackthorn Estate. Consider making one
of them **Indian**: a 1950s Rajasthani *haveli* during a wedding, the monsoon sealing
the courtyard, same rules. Reasons — nobody else's portfolio has it, the art direction
(jharokhas, the courtyard, oil lamps, rain on stone) is gorgeous and completely
distinct from the Victorian palette, and the domestic-motive structure fits it
perfectly.

---

## 5. B-Tier — nice, later

- **Detective progression** — rank (Constable → Chief Inspector) earned from solved
  cases, purely cosmetic. Unlock detective skins or a cursor variant.
- **Daily Case** — the same seed for everyone that day, leaderboard by time. The
  biggest retention mechanic per line of code in existence.
- **Practice / solo mode** — one player vs. the clock. Doubles as the tutorial *and*
  as the thing a recruiter clicks without needing a second tab.
- **A real tutorial case** — 3 rooms, 3 suspects, 4 minutes, hand-authored.
- **Emote / taunt wheel** — four canned lines to the rival ("Getting close." / "Nice
  try."). Social salt, zero chat-moderation risk.
- **Accessibility pass** — colourblind-safe clue pips, full-keyboard notebook
  navigation, captions for every audio sting (`prefers-reduced-motion` is partly done).
- **Mobile / touch layout** — virtual stick plus tap-to-examine. Big reach, real work.
- **Photo mode** — freeze, hide the HUD, screenshot with the case title card.

---

## 6. Moonshots (fun to think about, don't start now)

- **Voice / free-text interrogation** — type a question, an LLM answers *in character*
  but constrained to the baked truth table. The killer feature of the genre, and the
  one that most needs guardrails: it must never leak the solution, so the model runs
  server-side against a redacted case view.
- **Case generated from a prompt** — "give me a case about a lighthouse keeper" → a
  full playable mystery. Phase 3's live API with a UI on top.
- **Persistent manor** — solved cases leave marks; a season-long meta-mystery across
  ten cases with a recurring antagonist.
- **Replay export** — the reconstruction as a shareable GIF or video.

---

## 7. What a recruiter actually notices (portfolio lens)

Ranked by "will this make someone stop scrolling":

1. **A 20-second GIF** at the top of the README: rain, the briefing typing out, a
   confront collapsing a lie, the reveal. Nothing else in the README matters as much.
2. **The "how you could have known" screen** — it makes the game look *designed*.
3. **A live demo link** where one click drops you into a solo case against a bot
   rival. Deployment (Phase 4) is worth more than any two features here.
4. **An architecture write-up** on the anti-cheat boundary — "the solution never
   leaves the server; `buildView()` is the only serializer" is a genuinely strong
   engineering story. ARCHITECTURE.md has the bones; add a diagram.
5. **The test suite** — 10 server suites plus 2-tab puppeteer e2e is unusual for a
   portfolio game. Say so, out loud, in the README.

---

## 8. Suggested next three sessions (my pick)

1. **Session A — "How you could have known" + the newspaper reveal.** Highest drama
   per hour, zero new assets, makes every existing system look better.
2. **Session B — case archive + share card + the mid-game tension beats.** Retention
   and "one more case" pressure.
3. **Session C — Phase 3 kickoff: live generation, but with the archetype library from
   §4.1 as the skeleton** so generated cases can't come out thin.

Cheap warm-ups any time: finish 2.5 (`bubbles.say()` on clue-found / nothing-found /
questioning, plus the procedural idle), and the suspect-caught reaction from §3.3.

---

## 9. Research notes / sources

- Golden Idol design + playtesting: [Game Developer](https://www.gamedeveloper.com/design/case-of-the-golden-idol) ·
  [Thinky Games](https://thinkygames.com/features/how-the-case-of-the-golden-idol-developers-made-one-of-the-decades-best-detective-games-twice/) ·
  [Vice](https://www.vice.com/en/article/the-case-of-the-golden-idol-perfected-the-detective-genre/)
- Procedural mystery pitfalls: [Shadows of Doubt — replayability discussion](https://steamcommunity.com/app/986130/discussions/0/3764482829417319476/) ·
  [Lessons in procedural game design](https://screegames.com/2023/08/29/berries-on-the-hill-lessons-in-procedural-game-design/)
- Crime Patrol format: [Wikipedia](https://en.wikipedia.org/wiki/Crime_Patrol_(TV_series)) ·
  [Airtel blog — evolution of Crime Patrol](https://www.airtel.in/blog/entertainment/from-real-crimes-to-reel-impact-the-journey-of-crime-patrol/)
- Public-domain Victorian cases: [Ardlamont murder](https://en.wikipedia.org/wiki/Ardlamont_murder) ·
  [Victorian London — Whitechapel Road murder](https://www.victorianlondon.org/crime/harrietlane.htm) ·
  [Notorious Victorian killings](https://www.historytools.org/stories/murder-and-mayhem-the-most-notorious-killings-of-victorian-england)
- Social deduction market scan: [Best social deduction games 2026](https://boardgamesguide.com/tested-50-social-deduction-games-best-2026/) ·
  [Mystery board games 2026](https://coopboardgames.com/rankings/best-mystery-games/)
