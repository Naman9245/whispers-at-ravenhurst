// Authoritative state for one game room. The server is the source of truth:
// player positions, found clues, dialogue seen, question budgets, accusation
// locks, and (later) the full case incl. solution all live here and are NEVER
// serialized to a client except through buildView(), which filters per player.
import { ROOM_IDS, ROOMS } from "../shared/mapData.js";
import {
  CHARACTERS, PROGRESS_TOTAL, QUESTION_CAP,
  DEFAULT_SETTINGS, DEV_SETTINGS, sanitizeSettings,
} from "../shared/constants.js";
import { findQuestion, isFreeQuestion } from "../shared/suspectQuestions.js";
import { HOTSPOT_BY_ID } from "../shared/roomHotspots.js";
import { buildView } from "./views.js";
import { generateCase } from "./ai/generateCase.js";

const START_ROOM = "study";

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
    this.settings = (() => {
      const fast = process.env.WHISPERS_FAST_TIMERS;
      if (fast === "demo") return { ...DEFAULT_SETTINGS, softTimer: 900, accuseGate: 0, opponentWindow: 120 };
      if (fast) return { ...DEFAULT_SETTINGS, softTimer: 8, accuseGate: 0, opponentWindow: 2 };
      const base = devMode ? DEV_SETTINGS : DEFAULT_SETTINGS;
      return settings ? sanitizeSettings(settings, base) : base;
    })();
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
    this._softTimer = null;           // force-resolve at softTimer
    this._windowTimer = null;         // resolve when the final window closes
  }

  isFull() { return this.players.length >= 2; }
  player(id) { return this.players.find((p) => p.id === id); }
  opponentOf(id) { return this.players.find((p) => p.id !== id); }

  addPlayer({ id, name }) {
    const character = CHARACTERS[this.players.length] || CHARACTERS[1];
    const player = {
      id,                              // current socket id
      token: cryptoId(),               // stable id for reconnects (step 12)
      name: name?.trim() || (character === "holmes" ? "Holmes" : "Watson"),
      character,                       // "holmes" | "watson"
      room: START_ROOM,                // authoritative room occupancy (private)
      inCorridor: false,               // true when standing in the corridor
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
    this.startedAt = Date.now();
    return true;
  }

  // The case briefing is client-side ceremony, but the clock was already running
  // behind it — so a player who sat and read the story lost that time from the
  // game, and in Dev Mode (a 60s cap) the soft timer expired while the story was
  // still typing and the reveal replaced it with "No one cracked the case".
  //
  // So play now BEGINS when both detectives have put the briefing down. This is
  // deliberately additive: startedAt is still set on join, so a client that never
  // sends case:ready (every raw-socket test does exactly that) behaves precisely
  // as before. Acking only pushes the origin forward, and only once.
  //
  // Returns true when this ack actually started play, so the caller knows to
  // re-arm the soft cap against the new origin.
  markReady(id) {
    if (this.status !== "playing" || this.playStarted) return false;
    const p = this.player(id);
    if (!p) return false;
    p.ready = true;
    if (!this.players.every((x) => x.ready)) return false;
    this.playStarted = true;
    this.startedAt = Date.now();      // the clock starts HERE, not at join
    this.finalDeadline = null;
    return true;
  }

  // SERVER-AUTHORITATIVE region tracking. The client free-roams in pixel space
  // and reports which room it has entered (or that it's in the corridor). The
  // server validates room changes against the graph (you can only enter the
  // current room or a neighbour) — the connection graph still gates movement.
  // Returns { ok, room, inCorridor, changedRoom, error? }.
  setRegion(id, { room, inCorridor } = {}) {
    if (this.status !== "playing") return { ok: false, error: "Game is not active." };
    const p = this.player(id);
    if (!p) return { ok: false, error: "You are not in this game." };
    // Deliberately NOT gated on p.accusation. A locked-in detective may keep
    // pacing the manor while their rival finishes — sitting frozen for the rest
    // of the game was the worst part of locking in early. It leaks nothing:
    // room/inCorridor are private to this player, and the chat line movement.js
    // emits is already vague on purpose. Investigation and questioning stay shut.

    let changedRoom = false;
    if (room && room !== p.room) {
      if (!ROOM_IDS.includes(room)) return { ok: false, error: "No such room." };
      // Every room opens onto the shared corridor, so any room is reachable. We
      // only validate that it's a real room — the geometry (walls/doorways) is the
      // actual constraint, enforced client-side during free-roam.
      p.room = room;
      changedRoom = true;
    }
    p.inCorridor = Boolean(inCorridor);
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
    if (this.status !== "playing") return { ok: false, error: "Game is not active." };
    const p = this.player(id);
    if (!p) return { ok: false, error: "You are not in this game." };
    if (p.accusation) return { ok: false, locked: true, error: "You've locked in — you can only wait for your rival now." };
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
    if (this.status !== "playing") return { ok: false, error: "Game is not active." };
    const p = this.player(id);
    if (!p) return { ok: false, error: "You are not in this game." };
    if (p.accusation) return { ok: false, locked: true, error: "You've locked in — you can only wait for your rival now." };
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
  tryExamine(id, hotspotId) {
    if (this.status !== "playing") return { ok: false, error: "Game is not active." };
    const p = this.player(id);
    if (!p) return { ok: false, error: "You are not in this game." };
    if (p.accusation) return { ok: false, locked: true, error: "You've locked in — you can only wait for your rival now." };
    const spot = HOTSPOT_BY_ID[hotspotId];
    if (!spot) return { ok: false, error: "No such hotspot." };
    if (p.inCorridor || spot.room !== p.room) return { ok: false, error: "You must stand in that room to examine it." };
    if (p.examinedHotspots.includes(hotspotId)) return { ok: false, already: true, error: "You have already examined this." };

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

  // ---- accusation: gate, lock-in, scoring, reveal -----------------------

  accuseOpensAt() { return (this.startedAt || 0) + this.timers.accuseGate * 1000; }
  lockedCount() { return this.players.filter((p) => p.accusation).length; }
  clearTimers() {
    clearTimeout(this._softTimer);
    clearTimeout(this._windowTimer);
    this._softTimer = this._windowTimer = null;
  }
  startFinalWindow() { this.finalDeadline = Date.now() + this.timers.opponentWindow * 1000; }

  // Validate and store one player's accusation. Gate: not before accuseGate.
  // Clues cited must be 2–3, distinct, and actually in the player's found list.
  tryLock(id, { culpritId, weaponId, roomId, clueIds } = {}) {
    if (this.status !== "playing") return { ok: false, error: "Game is not active." };
    const p = this.player(id);
    if (!p) return { ok: false, error: "You are not in this game." };
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

  // base: +1 per correct of culprit/weapon/room (3 = perfect). reasoning: +1 per
  // cited clue that genuinely supports the solution, capped at +3. speed set later.
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
      if (cl && this._supportsSolution(cl)) reasoning++;
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

function cryptoId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
