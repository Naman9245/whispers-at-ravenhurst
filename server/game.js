// Authoritative state for one game room. The server is the source of truth:
// player positions, found clues, dialogue seen, question budgets, accusation
// locks, and (later) the full case incl. solution all live here and are NEVER
// serialized to a client except through buildView(), which filters per player.
import { randomUUID } from "node:crypto";
import { ROOM_IDS, ROOMS, doorwayGap } from "../shared/mapData.js";
import {
  CHARACTERS, PROGRESS_TOTAL, QUESTION_CAP, MOVE_SPEED, SEARCH_MS, BRIEFING_MAX_MS, NAME_MAX,
  DEFAULT_SETTINGS, DEV_SETTINGS, sanitizeSettings,
} from "../shared/constants.js";
import { findQuestion, isFreeQuestion } from "../shared/suspectQuestions.js";
import { HOTSPOT_BY_ID } from "../shared/roomHotspots.js";
import { buildView } from "./views.js";
import { generateCase } from "./ai/generateCase.js";

const START_ROOM = "study";

// Slack on the anti-teleport travel time, so network jitter squeezing the gap
// between two honest region reports never slows an honest player down.
const TRAVEL_SLACK = 0.8;

// Display names are untrusted wire data that end up on the rival's screen: text
// only, no control characters, capped to the lobby input's length.
function cleanName(raw, fallback) {
  const s = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, NAME_MAX) : "";
  return s || fallback;
}

export class GameRoom {
  constructor(code, devMode = false, settings = null) {
    this.code = code;
    this.devMode = devMode;
    this.status = "lobby";            // "lobby" | "playing" | "ended"
    this.players = [];                // see addPlayer()
    this.caseData = null;             // set at start (incl. solution — server only)
    // Room settings, chosen by whoever created the room. `settings` is untrusted
    // wire data, so it only ever arrives through sanitizeSettings().
    // WHISPERS_FAST_TIMERS collapses the clock for automated runs and still wins
    // over everything, because the whole test suite depends on that precedence:
    //   "demo" → gate open, long soft cap (manual browser walkthroughs)
    //   any other truthy → tiny timers (fast automated tests)
    const fast = process.env.WHISPERS_FAST_TIMERS;
    this.settings = (() => {
      if (fast === "demo") return { ...DEFAULT_SETTINGS, softTimer: 900, accuseGate: 0, opponentWindow: 120 };
      if (fast) return { ...DEFAULT_SETTINGS, softTimer: 8, accuseGate: 0, opponentWindow: 2 };
      const base = devMode ? DEV_SETTINGS : DEFAULT_SETTINGS;
      return settings ? sanitizeSettings(settings, base) : base;
    })();
    // Real-time pacing the server enforces (see beginExamine / setRegion). Fast
    // timers collapse these along with the clock, so the socket suites can walk
    // and search at full speed; the client still plays its own search animation.
    this.searchMs = fast ? 0 : SEARCH_MS;
    this.travelScale = fast ? 0 : 1;
    // The same three keys buildView() has always shipped, derived rather than
    // duplicated so the wire shape is unchanged.
    this.timers = {
      softTimer: this.settings.softTimer,          // null = no time limit at all
      accuseGate: this.settings.accuseGate,
      opponentWindow: this.settings.opponentWindow,
    };
    this.createdAt = Date.now();
    this.startedAt = null;            // epoch ms when play began (timer origin)
    this.finalDeadline = null;        // epoch ms the final accusation window closes
    this.reveal = null;               // computed once, at game end
    this.playStarted = false;         // both detectives have dismissed the briefing
    this.briefingEndsAt = null;       // epoch ms play starts regardless (see start)
    this._softTimer = null;           // force-resolve at softTimer
    this._windowTimer = null;         // resolve when the final window closes
    this._briefingTimer = null;       // begin play when the briefing runs out
  }

  isFull() { return this.players.length >= 2; }
  player(id) { return this.players.find((p) => p.id === id); }
  opponentOf(id) { return this.players.find((p) => p.id !== id); }

  addPlayer({ id, name }) {
    const character = CHARACTERS[this.players.length] || CHARACTERS[1];
    const player = {
      id,                              // current socket id
      token: randomUUID(),             // stable id for reconnects (step 12)
      name: cleanName(name, character === "holmes" ? "Holmes" : "Watson"),
      character,                       // "holmes" | "watson"
      room: START_ROOM,                // authoritative room occupancy (private)
      inCorridor: false,               // true when standing in the corridor
      corridorSince: null,             // when they last stepped out of a room
      roomReadyAt: 0,                  // earliest they could really be in `room`
      searching: null,                 // hotspot id while a search is in flight
      clues: [],                       // ids the player has found (private)
      examinedHotspots: [],            // hotspot ids this player has examined (private)
      questionsUsed: {},               // suspectId -> [questionIds asked] (ids, not a count,
                                       //   so the UI can grey out what's been used)
      confronted: {},                  // suspectId -> [clueIds already used as evidence]
      ready: false,                    // has dismissed the case briefing (see markReady)
      lockedIn: false,                 // has submitted accusation (step 10)
      accusation: null,                // payload (private until reveal)
      connected: true,
    };
    this.players.push(player);
    return player;
  }

  removePlayer(id) {
    this.players = this.players.filter((p) => p.id !== id);
  }

  // Begin play once two players are present. Generates (or falls back to) the
  // case — solution and clue contents live HERE only, never serialized to a view.
  async start() {
    if (this.players.length < 2) return false;
    this.caseData = await generateCase({ devMode: this.devMode });
    this.status = "playing";
    // A provisional origin, so the view has a clock to show. The real one is set
    // by beginPlay(), once the briefing is over.
    this.startedAt = Date.now();
    this.briefingEndsAt = this.startedAt + BRIEFING_MAX_MS;
    return true;
  }

  // The case briefing sits between the lobby and the manor, and NOTHING may be
  // done until it is over for both detectives. Before this gate, whoever put the
  // file down first could already search and question while the other was still
  // reading — a free head start in a race — and could even lock in, after which
  // the rival's ack wiped the final-window deadline off their screen.
  //
  // Returns true when this ack means everyone is ready; the caller then runs
  // beginPlay() (which also re-arms the soft cap against the new origin).
  markReady(id) {
    if (this.status !== "playing" || this.playStarted) return false;
    const p = this.player(id);
    if (!p) return false;
    p.ready = true;
    return this.players.every((x) => x.ready);
  }

  // Play begins: both acked, or the briefing ran out (BRIEFING_MAX_MS). Once only.
  beginPlay() {
    if (this.status !== "playing" || this.playStarted) return false;
    this.playStarted = true;
    this.startedAt = Date.now();      // the clock starts HERE, not at join
    this.briefingEndsAt = null;
    clearTimeout(this._briefingTimer);
    this._briefingTimer = null;
    return true;
  }

  // The checks every in-game ACTION shares. Returns an error result, or null.
  _actionGate(id, { allowLocked = false } = {}) {
    if (this.status !== "playing") return { ok: false, error: "Game is not active." };
    const p = this.player(id);
    if (!p) return { ok: false, error: "You are not in this game." };
    if (!this.playStarted) return { ok: false, briefing: true, error: "The investigation hasn't begun — your rival is still reading the case file." };
    if (!allowLocked && p.accusation) return { ok: false, locked: true, error: "You've locked in — you can only wait for your rival now." };
    return null;
  }

  _isSuspect(id) {
    return typeof id === "string" && (this.caseData?.suspects || []).some((s) => s.id === id);
  }

  // SERVER-AUTHORITATIVE region tracking. The client free-roams in pixel space
  // and reports which room it has entered (or that it's in the corridor). Every
  // room opens onto the shared corridor, so any real room may be entered; the
  // walls and doorways that shape the walk are enforced client-side.
  //
  // What the server CAN check is time. It can't see feet, but it can refuse to
  // believe a detective crossed the manor faster than a sprint: each room change
  // sets `roomReadyAt`, the earliest they could really have arrived (doorway-to-
  // doorway distance at top speed, timed from when they stepped out). Nothing is
  // rejected — a desync between client and server would be worse than the cheat
  // — but a search in the new room cannot finish before that moment. Honest
  // walkers have long since arrived; a teleporting script pays the walk anyway.
  // Returns { ok, room, inCorridor, changedRoom, error? }.
  setRegion(id, { room, inCorridor } = {}) {
    // Deliberately NOT gated on p.accusation. A locked-in detective may keep
    // pacing the manor while their rival finishes — sitting frozen for the rest
    // of the game was the worst part of locking in early. It leaks nothing:
    // room/inCorridor are private to this player, and the chat line movement.js
    // emits is already vague on purpose. Investigation and questioning stay shut.
    const gate = this._actionGate(id, { allowLocked: true });
    if (gate) return gate;
    const p = this.player(id);
    const now = Date.now();

    let changedRoom = false;
    if (room && room !== p.room) {
      if (!ROOM_IDS.includes(room)) return { ok: false, error: "No such room." };
      // A client that never reported the corridor stepped out "just now".
      const leftAt = p.inCorridor && p.corridorSince != null ? p.corridorSince : now;
      const speed = MOVE_SPEED * (this.settings.sprint ? 2 : 1);   // px per second
      const travelMs = this.travelScale * TRAVEL_SLACK * (doorwayGap(p.room, room) / speed) * 1000;
      p.roomReadyAt = Math.max(now, leftAt + travelMs);
      p.room = room;
      changedRoom = true;
    }
    const nowInCorridor = Boolean(inCorridor);
    if (nowInCorridor && !p.inCorridor) p.corridorSince = now;
    p.inCorridor = nowInCorridor;
    return { ok: true, room: p.room, inCorridor: p.inCorridor, changedRoom };
  }

  progressTotal() { return PROGRESS_TOTAL; }

  // ---- clues / investigation --------------------------------------------

  // First player (holmes) draws from the p1 clue sets, second (watson) from p2.
  _isPlayerOne(player) { return player.character === CHARACTERS[0]; }

  // Every clue this player is eligible to find: the shared set + their own
  // private set + their own red herring. (The opponent's clues are never here.)
  cluePoolFor(player) {
    const c = this.caseData?.clues;
    if (!c) return [];
    const mine = this._isPlayerOne(player)
      ? [...c.player1_private, ...c.red_herrings_p1]
      : [...c.player2_private, ...c.red_herrings_p2];
    return [...c.shared, ...mine];
  }

  // All red-herring ids in the case (these DON'T count toward the 7 progress).
  _herringIds() {
    const c = this.caseData?.clues;
    if (!c) return new Set();
    return new Set([...c.red_herrings_p1, ...c.red_herrings_p2].map((cl) => cl.id));
  }

  // How many of a player's found clues count toward progress (herrings excluded).
  progressCount(player) {
    const herrings = this._herringIds();
    return player.clues.filter((id) => !herrings.has(id)).length;
  }

  // Full found-clue objects for this player, in the order found, for their
  // notebook. Stripped of `eliminates` (the solver key) and `red_herring` (so a
  // herring is indistinguishable from a real clue — the player must reason it
  // out). This is the requesting player's OWN data; never the opponent's.
  foundCluesFor(player) {
    const byId = new Map(this.cluePoolFor(player).map((cl) => [cl.id, cl]));
    return player.clues
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((cl) => ({ id: cl.id, text: cl.text, tag: cl.tag, category: cl.category, found_in: cl.found_in, hotspot: cl.hotspot }));
  }

  // ---- suspect questioning (global; no room-binding) ---------------------

  _dialogueFor(suspectId) { return this.caseData?.dialogue_trees?.[suspectId]; }

  // Ask a generic pool question. Budget is QUESTION_CAP per (player, suspect).
  // Returns only the ONE answer branch — never the whole tree.
  tryAsk(id, suspectId, questionId) {
    const gate = this._actionGate(id);
    if (gate) return gate;
    const p = this.player(id);
    // Checked against the cast list, not by indexing the dialogue trees: an id
    // like "__proto__" or "constructor" would otherwise find a "tree".
    if (!this._isSuspect(suspectId)) return { ok: false, error: "No such suspect." };
    const tree = this._dialogueFor(suspectId);
    if (!tree) return { ok: false, error: "No such suspect." };
    // The question must belong to THIS suspect's set (core + their own).
    const q = findQuestion(suspectId, questionId);
    if (!q) return { ok: false, error: "No such question." };

    // ANTI-CHEAT: a clue-gated question is re-checked here. The client filters
    // its own list, but that list is advisory — a crafted socket message must
    // not be able to ask a question the player has not earned.
    if (q.requiresClue && !p.clues.includes(q.requiresClue)) {
      return { ok: false, locked: true, error: "You have no evidence to put to them on that." };
    }

    const asked = p.questionsUsed[suspectId] || (p.questionsUsed[suspectId] = []);
    const entry0 = tree.questions?.[questionId];
    const isLie = Boolean(entry0 && typeof entry0 === "object");
    const nowBroken = isLie && (p.confronted[suspectId] || []).includes(entry0.brokenBy);
    // A question can normally only be put once. The exception is a LIE whose
    // story has since collapsed: without this, a player who asked before finding
    // the contradicting evidence could never hear the suspect change their
    // answer — the whole point of the mechanic. Re-asking a broken lie is free
    // and allowed exactly once, tracked with a "!"-suffixed marker.
    const reAskKey = questionId + "!";
    const canReAsk = nowBroken && asked.includes(questionId) && !asked.includes(reAskKey);
    if (asked.includes(questionId) && !canReAsk) {
      return { ok: false, error: "You have already asked them that." };
    }

    // Core questions spend the budget; clue-unlocked ones are FREE — the player
    // already paid for them by finding the evidence.
    const free = isFreeQuestion(q) || canReAsk;
    const spent = asked.filter((qid) => !qid.endsWith("!") && !isFreeQuestion(findQuestion(suspectId, qid))).length;
    if (!free && spent >= QUESTION_CAP) {
      return { ok: false, capped: true, error: "No more questions for this suspect — find evidence to press them further." };
    }
    asked.push(canReAsk ? reAskKey : questionId);

    // A suspect who lies until confronted: the object form carries both answers
    // and the clue that breaks the story. Plain strings stay valid.
    let answer, broke = false;
    if (isLie) {
      broke = nowBroken;
      answer = broke ? entry0.afterConfront : entry0.base;
    } else {
      answer = entry0 ?? "They offer no answer to that.";
    }

    return {
      ok: true,
      suspectId,
      questionId,
      answer,
      broke,                                   // true when the lie has collapsed
      free,
      asked: spent + (free ? 0 : 1),
      cap: QUESTION_CAP,
    };
  }

  // Confront a suspect with a clue the player has FOUND. Each clue may be used
  // once per suspect. A matching evidence_response yields a behavioral tell;
  // otherwise the suspect deflects. Does NOT consume the question budget.
  tryConfront(id, suspectId, clueId) {
    const gate = this._actionGate(id);
    if (gate) return gate;
    const p = this.player(id);
    if (!this._isSuspect(suspectId)) return { ok: false, error: "No such suspect." };
    const tree = this._dialogueFor(suspectId);
    if (!tree) return { ok: false, error: "No such suspect." };
    if (!p.clues.includes(clueId)) return { ok: false, error: "You have not found that evidence." };

    const done = p.confronted[suspectId] || (p.confronted[suspectId] = []);
    if (done.includes(clueId)) return { ok: false, error: "You have already used that evidence here." };
    done.push(clueId);

    const resp = tree.evidence_responses?.[clueId];
    const response = resp
      ? { text: resp.text, tell: resp.tell }
      : { text: "They glance at it and shrug. “That tells you nothing about me.”", tell: null };
    return { ok: true, suspectId, clueId, response, hadTell: Boolean(resp?.tell) };
  }

  // Own-only questioning progress for the view: per-suspect asked count + the
  // clue ids already spent confronting them. Never the opponent's.
  questioningStateFor(player) {
    const out = {};
    for (const s of this.caseData?.suspects || []) {
      const askedIds = player.questionsUsed[s.id] || [];
      // Questions whose LIE has collapsed since the player asked them, and which
      // they have not yet re-put. Ids only — this reveals nothing about which
      // answers are lies until the player has already earned the confrontation.
      const tree = this._dialogueFor(s.id);
      const confrontedHere = player.confronted[s.id] || [];
      const reAskable = askedIds.filter((qid) => {
        if (qid.endsWith("!")) return false;
        const e = tree?.questions?.[qid];
        return e && typeof e === "object"
          && confrontedHere.includes(e.brokenBy)
          && !askedIds.includes(qid + "!");
      });
      out[s.id] = {
        // `asked` stays a number for existing consumers; askedIds lets the UI
        // grey out questions already put to this suspect.
        asked: askedIds.filter((qid) => !qid.endsWith("!") && !isFreeQuestion(findQuestion(s.id, qid))).length,
        askedIds,
        reAskable,
        confronted: confrontedHere,
      };
    }
    return out;
  }

  // SERVER-AUTHORITATIVE examination: examine ONE hotspot in the room the player is
  // standing in. Each hotspot can be examined once per player; it yields the
  // player's clue for that hotspot if one is placed there, else nothing. The
  // hotspot→clue mapping NEVER leaves the server until the player examines that
  // exact spot (anti-cheat). Returned clues are stripped of the `eliminates` key.
  //
  // A search takes TIME, and the server is what enforces it. The client used to
  // own the 2.5s search and only then ask for the result, so a script could skip
  // the wait and sweep all 24 hotspots in ~30ms. Now it's two steps with the
  // wait in between (handlers/investigate.js): beginExamine() validates and says
  // how long to wait — SEARCH_MS, plus any walk the player hasn't finished yet
  // (see setRegion) — and finishExamine() hands out the result. One search at a
  // time per player, so searches cannot be run in parallel either.
  _examineCheck(p, hotspotId) {
    // Own-key lookup: "__proto__" must not resolve to a "hotspot".
    const spot = typeof hotspotId === "string" && Object.hasOwn(HOTSPOT_BY_ID, hotspotId) ? HOTSPOT_BY_ID[hotspotId] : null;
    if (!spot) return { ok: false, error: "No such hotspot." };
    if (p.inCorridor || spot.room !== p.room) return { ok: false, error: "You must stand in that room to examine it." };
    if (p.examinedHotspots.includes(hotspotId)) return { ok: false, already: true, error: "You have already examined this." };
    return null;
  }

  // Returns { ok, waitMs } or an error result.
  beginExamine(id, hotspotId) {
    const gate = this._actionGate(id);
    if (gate) return gate;
    const p = this.player(id);
    if (p.searching) return { ok: false, busy: true, error: "You are already searching something." };
    const bad = this._examineCheck(p, hotspotId);
    if (bad) return bad;
    p.searching = hotspotId;
    const now = Date.now();
    return { ok: true, waitMs: Math.max(now, p.roomReadyAt) + this.searchMs - now };
  }

  // The search is over: everything is re-checked (the game may have ended, or
  // the player locked in or left, while they were searching), then the result.
  finishExamine(id, hotspotId) {
    const gate = this._actionGate(id);
    if (gate) return gate;
    const p = this.player(id);
    if (p.searching !== hotspotId) return { ok: false, error: "That search was interrupted." };
    const bad = this._examineCheck(p, hotspotId);
    if (bad) return bad;
    const spot = HOTSPOT_BY_ID[hotspotId];

    p.examinedHotspots.push(hotspotId);

    const clue = this.cluePoolFor(p).find(
      (cl) => cl.found_in === p.room && cl.hotspot === hotspotId && !p.clues.includes(cl.id)
    );
    if (!clue) {
      return { ok: true, found: false, hotspotId, hotspotName: spot.name, room: spot.room };
    }
    p.clues.push(clue.id);
    return {
      ok: true, found: true, hotspotId, hotspotName: spot.name, room: spot.room,
      clue: { id: clue.id, text: clue.text, tag: clue.tag, category: clue.category, found_in: clue.found_in, hotspot: clue.hotspot },
    };
  }

  // Always called when a search ends, however it ends.
  endSearch(id) {
    const p = this.player(id);
    if (p) p.searching = null;
  }

  // ---- accusation: gate, lock-in, scoring, reveal -----------------------

  accuseOpensAt() { return (this.startedAt || 0) + this.timers.accuseGate * 1000; }
  lockedCount() { return this.players.filter((p) => p.accusation).length; }
  clearTimers() {
    clearTimeout(this._softTimer);
    clearTimeout(this._windowTimer);
    clearTimeout(this._briefingTimer);
    this._softTimer = this._windowTimer = this._briefingTimer = null;
  }
  startFinalWindow() { this.finalDeadline = Date.now() + this.timers.opponentWindow * 1000; }

  // Validate and store one player's accusation. Gate: not before accuseGate.
  // Clues cited must be 2–3, distinct, and actually in the player's found list.
  tryLock(id, { culpritId, weaponId, roomId, clueIds } = {}) {
    const gate = this._actionGate(id, { allowLocked: true });
    if (gate) return gate;
    const p = this.player(id);
    if (p.accusation) return { ok: false, error: "You have already locked in." };
    if (Date.now() < this.accuseOpensAt()) return { ok: false, gated: true, error: "Accusations are not open yet." };
    if (!this.caseData.suspects.some((s) => s.id === culpritId)) return { ok: false, error: "Unknown suspect." };
    if (!this.caseData.weapons.some((w) => w.id === weaponId)) return { ok: false, error: "Unknown weapon." };
    if (!ROOM_IDS.includes(roomId)) return { ok: false, error: "Unknown room." };
    if (!Array.isArray(clueIds) || clueIds.length < 2 || clueIds.length > 3) return { ok: false, error: "Cite 2–3 supporting clues." };
    if (new Set(clueIds).size !== clueIds.length) return { ok: false, error: "Duplicate clue cited." };
    if (!clueIds.every((cid) => p.clues.includes(cid))) return { ok: false, error: "You can only cite clues you've found." };

    p.accusation = { culpritId, weaponId, roomId, clueIds: [...clueIds], lockedAt: Date.now() };
    p.lockedIn = true;
    return { ok: true };
  }

  _allCluesById() {
    const c = this.caseData.clues;
    const all = [...c.shared, ...c.player1_private, ...c.player2_private, ...c.red_herrings_p1, ...c.red_herrings_p2];
    return new Map(all.map((cl) => [cl.id, cl]));
  }

  // A clue "supports the solution" if it eliminates real candidates and never
  // contradicts the truth. Red herrings DO contradict the truth, so they earn no
  // reasoning credit — citing your herring is a self-inflicted penalty.
  _supportsSolution(clue) {
    const sol = this.caseData.solution;
    const e = clue.eliminates || {};
    const hitsTruth =
      (e.suspects || []).includes(sol.culprit_id) ||
      (e.weapons || []).includes(sol.weapon_id) ||
      (e.rooms || []).includes(sol.room_id);
    const hasElim = (e.suspects?.length || 0) + (e.weapons?.length || 0) + (e.rooms?.length || 0) > 0;
    return hasElim && !hitsTruth;
  }

  // Does this cited clue actually back the player's OWN accusation? It must be
  // real evidence (not a herring), must not rule out anything they accused, and
  // must narrow down a category they got RIGHT — so the credit is for proof of
  // your own correct answer.
  //
  // It used to be only `_supportsSolution`, which scores the clue against the
  // truth and ignores what the player said: an accusation wrong on all three
  // counts still took the full +3, even for a clue that eliminated the very
  // suspect they named.
  _backsAccusation(clue, a) {
    if (!this._supportsSolution(clue)) return false;
    const sol = this.caseData.solution;
    const e = clue.eliminates || {};
    const rulesOut = (cat, id) => (e[cat] || []).includes(id);
    if (rulesOut("suspects", a.culpritId) || rulesOut("weapons", a.weaponId) || rulesOut("rooms", a.roomId)) return false;
    return (a.culpritId === sol.culprit_id && (e.suspects?.length || 0) > 0)
        || (a.weaponId === sol.weapon_id && (e.weapons?.length || 0) > 0)
        || (a.roomId === sol.room_id && (e.rooms?.length || 0) > 0);
  }

  // base: +1 per correct of culprit/weapon/room (3 = perfect). reasoning: +1 per
  // cited clue that backs the player's own correct answer (see _backsAccusation),
  // capped at +3. speed set later.
  scoreFor(player) {
    if (!player.accusation) {
      return { base: 0, reasoning: 0, speed: 0, total: 0, correctComponents: 0, fullyCorrect: false, forfeited: true, lockedAt: Infinity };
    }
    const sol = this.caseData.solution;
    const a = player.accusation;
    const correct = [a.culpritId === sol.culprit_id, a.weaponId === sol.weapon_id, a.roomId === sol.room_id];
    const correctComponents = correct.filter(Boolean).length;
    const byId = this._allCluesById();
    let reasoning = 0;
    for (const cid of a.clueIds || []) {
      const cl = byId.get(cid);
      if (cl && this._backsAccusation(cl, a)) reasoning++;
    }
    return {
      base: correctComponents,
      reasoning: Math.min(3, reasoning),
      speed: 0,
      total: 0,
      correctComponents,
      fullyCorrect: correctComponents === 3,
      forfeited: false,
      lockedAt: a.lockedAt,
    };
  }

  // End the game once: score everyone, award speed, pick winner(s), build reveal.
  resolve() {
    if (this.status === "ended") return null;
    this.status = "ended";
    this.clearTimers();

    const scores = {};
    for (const p of this.players) scores[p.id] = this.scoreFor(p);

    // Speed: among FULLY-correct accusations, earliest gets +2, the rest +1.
    const correctBySpeed = this.players
      .filter((p) => scores[p.id].fullyCorrect)
      .sort((a, b) => scores[a.id].lockedAt - scores[b.id].lockedAt);
    correctBySpeed.forEach((p, i) => { scores[p.id].speed = i === 0 ? 2 : 1; });

    for (const p of this.players) {
      const s = scores[p.id];
      s.total = s.base + s.reasoning + s.speed;
    }

    // Only players who actually SUBMITTED an accusation can win. Previously the
    // max was taken over everyone, so a double forfeit (nobody accused → both
    // score 0) came out as "winners: [holmes, watson]" and the reveal announced
    // "A draw — both detectives prevail." for a game no one played. Forfeiting is
    // not a way to win; with no contenders `winners` is empty and RevealScreen's
    // "No one cracked the case." branch finally becomes reachable.
    const contenders = this.players.filter((p) => !scores[p.id].forfeited);
    const max = contenders.length ? Math.max(...contenders.map((p) => scores[p.id].total)) : -1;
    const winners = contenders.filter((p) => scores[p.id].total === max).map((p) => p.character);

    this.reveal = this._buildReveal(scores, winners);
    return this.reveal;
  }

  _fillMonologue() {
    const sol = this.caseData.solution;
    const culprit = this.caseData.suspects.find((s) => s.id === sol.culprit_id);
    const weapon = this.caseData.weapons.find((w) => w.id === sol.weapon_id);
    const room = ROOMS[sol.room_id]?.label || sol.room_id;
    return (this.caseData.narrative?.ending_monologue_template || "")
      .replaceAll("{culprit}", culprit?.name || "the culprit")
      .replaceAll("{weapon}", weapon?.name || "the weapon")
      .replaceAll("{room}", room);
  }

  _buildReveal(scores, winners) {
    const sol = this.caseData.solution;
    const sName = (id) => this.caseData.suspects.find((s) => s.id === id)?.name || id;
    const wName = (id) => this.caseData.weapons.find((w) => w.id === id)?.name || id;
    const rLabel = (id) => ROOMS[id]?.label || id;
    const culprit = this.caseData.suspects.find((s) => s.id === sol.culprit_id);
    return {
      solution: {
        culpritId: sol.culprit_id, culpritName: sName(sol.culprit_id),
        weaponId: sol.weapon_id, weaponName: wName(sol.weapon_id),
        roomId: sol.room_id, roomLabel: rLabel(sol.room_id),
        motive: culprit?.blurb || "",
      },
      monologue: this._fillMonologue(),
      players: this.players.map((p) => ({
        character: p.character,
        name: p.name,
        forfeited: !p.accusation,
        accusation: p.accusation
          ? {
              culpritId: p.accusation.culpritId, culpritName: sName(p.accusation.culpritId),
              weaponId: p.accusation.weaponId, weaponName: wName(p.accusation.weaponId),
              roomId: p.accusation.roomId, roomLabel: rLabel(p.accusation.roomId),
              clueIds: p.accusation.clueIds,
            }
          : null,
        score: scores[p.id],
      })),
      winners,
    };
  }

  // Privacy-filtered snapshot for one player (delegates to views.js).
  viewFor(id) { return buildView(this, id); }
}
