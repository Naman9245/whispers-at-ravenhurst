# Whispers at Ravenhurst

### A 2-player online deduction game with AI-generated mysteries

> **Last updated:** 2026-08-20 · current through **Phase 2.8**

> 📸 **Screenshots:** [`docs/screenshot.png`](docs/screenshot.png) and
> [`docs/screenshot-active.png`](docs/screenshot-active.png). Note these were
> captured before the hotspot-exploration pass (2.2), the cinematic main menu (2.7)
> and the 2.8 stage layout, so they show a much older HUD — a fresh hero capture /
> GIF of the current build is a pre-launch task. The newest in-repo captures live
> in [`.shots/`](.shots) (`layout-1-stage.png`, `camera-3-map.png`,
> `menu-1-main.png`).

---

## What It Is

**Whispers at Ravenhurst** is a real-time, two-player online deduction game set in a storm-sealed Victorian manor. Two detectives — Holmes and Watson — race to solve the same murder: *who* did it, with *which weapon*, in *which room*. Each game is a fresh, AI-generated mystery rendered in hand-feel pixel art. Players free-roam the mansion, search rooms for clues, interrogate six suspects, and piece together the truth from a mix of **shared** and **private** evidence. The twist isn't just speed — accusations are scored on the **reasoning** behind them, so the detective who can *prove* their case, not merely guess it, comes out ahead.

---

## Key Features

- 🧩 **AI-generated cases** via `claude-opus-4-8` — every game is a unique, solvable mystery. *(The generation pipeline + solvability validator are complete; the live API call is deferred — awaiting credits. Today the game ships on a baked, pre-validated case so it runs with zero setup.)*
- 🛡️ **Server-authoritative anti-cheat** — the solution never reaches a client until the reveal.
- ⚖️ **Dual-window accusation system** with **reasoning-based scoring** (base + reasoning + speed).
- 🔎 **Private clue investigation** — 3 shared clues + 4 private per player, plus red herrings.
- 🔦 **Hotspot exploration** — search specific furniture (walk up + press **E**, or click) to uncover evidence, instead of one generic button.
- 🔍 **Searching animation** — a 2.5s "examining…" beat with a cute white cloud thought-bubble before the result, so it feels like real detective work.
- 🏃 **Sprint** — hold **Shift** to move at 2× speed across the manor.
- 🗣️ **Pre-generated suspect dialogue trees** with evidence confrontation and behavioral "tells" — and suspects who **lie until you break their story** with the right clue.
- 🎛️ **Host-chosen game settings** (Among Us style) — time limit **Off / 15 / 20 / 30 / 45 min**, accuse gate, rival window, hotspot markers, sprint, and whether you can see your rival's progress. All whitelisted server-side.
- 🎥 **Zoom-and-follow camera** with a **hidden manor map** (press **M**) that shows a live "you are here" — including in the corridor.
- 🎬 **Case briefing cinematic** — the game opens on black and types the case out; the clock doesn't start until *both* detectives put the file down.
- 🔌 **Real-time multiplayer** over WebSockets, with disconnect detection and a reconnect grace window.
- 🎨 **Indie pixel-art Victorian noir** aesthetic, drawn on a raw HTML5 canvas (no game engine) — the static board is **baked once** and blitted, so the art is free at runtime.
- 🔊 **Full sound pass** — rain bed, random creaks, footsteps, searching loop, clue stings, UI clicks, and dramatic lock-in / reveal stings, all behind one mute toggle.
- 🕯️ **Cinematic main menu** over an idle mansion scene with two wandering ghost detectives.
- 🖥️ **Board-first UI** — a race scoreboard on top, the board as the hero, a Scenario/Questions/Log strip beneath, and a rail of flip-card suspect dossiers alongside.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + HTML5 Canvas 2D, bundled with Vite 5 |
| **Backend** | Node.js (ESM) + Express 4 + Socket.io 4 |
| **AI** | Anthropic Claude API (`claude-opus-4-8`) |
| **Architecture** | Server-authoritative state machine; a shared rules layer imported by both sides |

---

## How to Run Locally

### Prerequisites
- **Node.js 18+** (developed on Node 22)
- No API key required to play — the game ships with a baked, pre-validated case. *(An `ANTHROPIC_API_KEY` will enable live case generation once that integration is switched on; it is read server-side only and never sent to a client.)*

### Steps
```bash
# 1. Clone
git clone https://github.com/Naman9245/whispers-at-ravenhurst.git
cd whispers-at-ravenhurst

# 2. Install client + server dependencies
npm run install:all

# 3. Start the server (:3001) and the client (:5173) together
npm run dev
```

Then open **http://localhost:5173** in **two browser tabs** (it's a 2-player game):
1. **Tab A** → *Begin Investigation* → *Create Room* → dial in the **game settings**
   (time limit, accuse gate, rival window, hotspot markers, sprint, rival progress),
   or tick **Dev Mode** for fast 60s / 20s / 30s timers → note the room code.
2. **Tab B** → *Join with Code* → enter the code.

The game auto-starts when both detectives are present.

> You can also run the processes separately: `npm run server` (backend) and `npm run client` (frontend).

---

## Game Rules (short version)

- **Two detectives, one mansion, one murder.** Solve *culprit + weapon + room*.
- The game opens on the **case briefing**. The clock only starts once **both** detectives dismiss it, so reading the file costs you nothing.
- Both players **move freely** (WASD / arrow keys), **examine furniture hotspots** (walk up + press **E**, or click) to find clues, and **question** suspects — simultaneously, no turns.
- **Controls:** WASD / arrows to move · **Shift** to sprint · **E** or click to examine · **M** for the manor map · **Enter / Esc** to close popups.
- You gather **3 shared clues** (either player can find them) and **4 private clues** (yours alone), plus the occasional **red herring** that looks real but secretly contradicts the truth and never counts toward your total.
- **Everything you need to reason with is on screen.** Suspect cards carry height, build and handedness (flip one for the full dossier); weapons carry a type — BLADE / BLUNT / POISON / LIGATURE / FIREARM. Clues describe what the *killer* was; you cross the names off yourself.
- You get **4 core questions per suspect**. Questions unlocked by a clue you found are **free** — investigating buys interrogation leverage. Some suspects **lie**: confront them with the contradicting evidence and their story breaks open.
- The **ACCUSE** button unlocks after a gate the host picks (**5 minutes** by default, **20 seconds** in Dev Mode) so there's time to actually deduce. An accusation must cite **2–3 clues you actually found**.
- The **first lock-in** opens a final window for the other detective; when both lock in (or time expires) the case resolves. With **Time limit: Off** there is no wall clock at all — the case stays open until someone accuses. Locking in early doesn't freeze you: you can still walk the manor while your rival finishes.
- **Higher score wins:** `base` (+1 each for correct culprit / weapon / room) + `reasoning` (+1 per cited clue that genuinely supports the solution, capped at +3) + `speed` (among fully-correct accusations, earliest +2, the rest +1).

---

## Project Structure

```
whispers-at-ravenhurst/
├── shared/              # SINGLE SOURCE OF TRUTH (imported by client AND server)
│   ├── mapData.js           # rooms, connection graph, walkable geometry, collision
│   ├── roomObjects.js       # every piece of furniture: draw rect = collision rect
│   ├── roomHotspots.js      # the 4 searchable hotspots per room (24) — DERIVED
│   ├── constants.js         # timers, room settings + sanitizer, clue counts, speed
│   ├── suspectQuestions.js  # 102 questions: 12 core + 15 per suspect
│   └── caseSchema.js        # case JSON shape + solvability + hotspot validator
├── server/              # Node + Express + Socket.io (authoritative game state)
│   ├── index.js             # bootstrap + per-connection handler wiring
│   ├── rooms.js             # RoomStore + lobby (create/join/leave/disconnect/reap)
│   ├── game.js              # GameRoom: authoritative state, rules, scoring
│   ├── views.js             # buildView() — the per-player privacy boundary
│   ├── handlers/            # movement · investigate · suspects · accusation
│   ├── ai/                  # generateCase() + fallbackCase.json
│   └── test/                # node socket + unit tests (10 suites)
├── client/              # React + Canvas frontend (Vite)
│   └── src/
│       ├── App.jsx          # menu → lobby → briefing → playing → reveal + wiring
│       ├── game/            # BoardCanvas, Character, camera, boardLayers (the bake),
│       │                    #   drawBoard, menuScene, playerPos, bubbles, sound
│       ├── components/      # HUD, stage, suspect rail, panels, modals, menu, reveal
│       └── net/socket.js    # promise-based intent senders (the `net` object)
├── scripts/dev.js       # runs both servers; frees ports 3001/5173 first
├── .shots/              # puppeteer e2e suites + screenshots (dev artifacts)
├── assets/              # Holmes / Watson sprite sets (Pixellab)
├── reference/           # whispers-mockup.png (Gemini concept mockup)
└── docs/                # screenshots + PHASE-2.8-PLAN.md
```

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the technical deep-dive, **[DEVLOG.md](DEVLOG.md)** for the build journey and design decisions, and **[ROADMAP.md](ROADMAP.md)** for what's done and what's planned.

---

## Credits

- **Character sprites** generated via [Pixellab.ai](https://www.pixellab.ai/) — eight-direction Walking + Idle animations, indexed in `client/public/assets/sprites.json`.
- **Reference mockup** generated via Google **Gemini** (`reference/whispers-mockup.png`).
- **Sound** — CC0 clips from freesound.org / pixabay / mixkit, each logged in
  [`client/public/sounds/CREDITS.md`](client/public/sounds/CREDITS.md).
- **Design & engineering:** Naman.
- Built with **[Claude Code](https://claude.com/claude-code)**.

---

## License

MIT — see [LICENSE](LICENSE).
