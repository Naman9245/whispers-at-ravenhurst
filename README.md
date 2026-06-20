# Whispers at Ravenhurst

### A 2-player online deduction game with AI-generated mysteries

> **Last updated:** 2026-06-20

<!-- TODO: add hero screenshot / GIF -->
<!-- Suggested: a 1600×900 capture of the in-game board, or a short GIF of an investigation → accusation flow. -->

---

## What It Is

**Whispers at Ravenhurst** is a real-time, two-player online deduction game set in a storm-sealed Victorian manor. Two detectives — Holmes and Watson — race to solve the same murder: *who* did it, with *which weapon*, in *which room*. Each game is a fresh, AI-generated mystery rendered in hand-feel pixel art. Players free-roam the mansion, search rooms for clues, interrogate six suspects, and piece together the truth from a mix of **shared** and **private** evidence. The twist isn't just speed — accusations are scored on the **reasoning** behind them, so the detective who can *prove* their case, not merely guess it, comes out ahead.

---

## Key Features

- 🧩 **AI-generated cases** via `claude-opus-4-8` — every game is a unique, solvable mystery. *(The generation pipeline + solvability validator are complete; the live API call is the Phase 2.1 slot-in. Today the game ships on a baked, pre-validated case so it runs with zero setup.)*
- 🛡️ **Server-authoritative anti-cheat** — the solution never reaches a client until the reveal.
- ⚖️ **Dual-window accusation system** with **reasoning-based scoring** (base + reasoning + speed).
- 🔎 **Private clue investigation** — 3 shared clues + 4 private per player, plus red herrings.
- 🔦 **Hotspot exploration** — search specific furniture (walk up + press **E**, or click) to uncover evidence, instead of one generic button.
- 🗣️ **Pre-generated suspect dialogue trees** with evidence confrontation and behavioral "tells."
- 🔌 **Real-time multiplayer** over WebSockets, with disconnect detection and a reconnect grace window.
- 🎨 **Indie pixel-art Victorian noir** aesthetic, drawn on a raw HTML5 canvas (no game engine).
- 🖥️ **Minimalist fullscreen UI** — the board is the hero (~85% of the viewport); the activity log and notebook live behind slide-in panels.

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
- No API key required to play — the game ships with a baked, pre-validated case. *(An `ANTHROPIC_API_KEY` will enable live case generation once Phase 2.1 lands; it is read server-side only and never sent to a client.)*

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
1. **Tab A** → *Create Room* (tick **Dev Mode** for fast 60s / 20s / 30s timers) → note the room code.
2. **Tab B** → *Join with Code* → enter the code.

The game auto-starts when both detectives are present.

> You can also run the processes separately: `npm run server` (backend) and `npm run client` (frontend).

---

## Game Rules (short version)

- **Two detectives, one mansion, one murder.** Solve *culprit + weapon + room*.
- Both players **move freely** (WASD / arrow keys), **examine furniture hotspots** (walk up + press **E**, or click) to find clues, and **question** suspects — simultaneously, no turns.
- **Controls:** WASD / arrows to move · **Shift** to sprint · **E** or click to examine · **Enter / Esc** to close popups.
- You gather **3 shared clues** (either player can find them) and **4 private clues** (yours alone), plus the occasional **red herring** that looks real but secretly contradicts the truth and never counts toward your total.
- The **ACCUSE** button unlocks after a gate (**5 minutes** in production, **20 seconds** in Dev Mode) so there's time to actually deduce.
- The **first lock-in** opens a final window for the other detective; when both lock in (or time expires) the case resolves.
- **Higher score wins:** `base` (+1 each for correct culprit / weapon / room) + `reasoning` (+1 per cited clue that genuinely supports the solution, capped at +3) + `speed` (among fully-correct accusations, earliest +2, the rest +1).

---

## Project Structure

```
whispers-at-ravenhurst/
├── shared/              # SINGLE SOURCE OF TRUTH (imported by client AND server)
│   ├── mapData.js           # rooms, connection graph, walkable geometry
│   ├── roomHotspots.js      # the 4 searchable hotspots per room (24 total)
│   ├── constants.js         # timers, clue counts, question cap, move speed
│   ├── questions.js         # the 10-question suspect pool
│   └── caseSchema.js        # case JSON shape + solvability + hotspot validator
├── server/              # Node + Express + Socket.io (authoritative game state)
│   ├── index.js             # bootstrap + per-connection handler wiring
│   ├── rooms.js             # RoomStore + lobby (create/join/disconnect)
│   ├── game.js              # GameRoom: authoritative state, rules, scoring
│   ├── views.js             # buildView() — the per-player privacy boundary
│   ├── handlers/            # movement · investigate · suspects · accusation
│   ├── ai/                  # generateCase() + fallbackCase.json
│   └── test/                # node socket + unit tests
├── client/              # React + Canvas frontend (Vite)
│   └── src/
│       ├── App.jsx          # phases (lobby → playing → reveal) + event wiring
│       ├── game/            # BoardCanvas, Character, drawBoard, sprites, sound
│       ├── components/      # HUD, panels, modals, lobby, reveal screen
│       └── net/socket.js    # promise-based intent senders (the `net` object)
├── assets/              # Holmes / Watson sprite sets (Pixellab)
├── reference/           # whispers-mockup.png (Gemini concept mockup)
└── docs/                # screenshots
```

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the technical deep-dive, **[DEVLOG.md](DEVLOG.md)** for the build journey and design decisions, and **[ROADMAP.md](ROADMAP.md)** for what's done and what's planned.

---

## Credits

- **Character sprites** generated via [Pixellab.ai](https://www.pixellab.ai/) — eight-direction Walking + Idle animations, indexed in `client/public/assets/sprites.json`.
- **Reference mockup** generated via Google **Gemini** (`reference/whispers-mockup.png`).
- **Design & engineering:** Naman.
- Built with **[Claude Code](https://claude.com/claude-code)**.

---

## License

MIT — see `LICENSE`. <!-- TODO: add LICENSE file -->
