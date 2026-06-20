// Tunables shared by client and server so they never disagree on the rules.

export const CHARACTERS = ["holmes", "watson"];

// Free-roam walking speed (pixels per second, internal board resolution).
// ~2.6 px/frame at 60fps.
export const MOVE_SPEED = 160;

// Accusation timing presets (seconds). Production is the default; Dev Mode in the
// lobby swaps to the short preset so the dual-window flow is testable.
//   softTimer    — the whole-game soft cap (force-resolve if nobody has locked in)
//   accuseGate   — how long before ACCUSE unlocks (gather clues first)
//   opponentWindow — the final window the first lock-in grants the other player
export const TIMER_PRESETS = {
  production: { softTimer: 1200, accuseGate: 300, opponentWindow: 180 }, // 20m / 5m / 3m
  dev:        { softTimer: 60,   accuseGate: 20,  opponentWindow: 30 },  // short, for testing
};

// Suspect questioning budget (per suspect, per player).
export const QUESTION_CAP = 3;

// Fixed clue distribution for Phase 1 (deterministic for testing/validation).
//   3 shared + 4 private = 7 counted toward progress; 1 red herring is extra noise.
export const CLUE_DISTRIBUTION = {
  shared: 3,
  privatePerPlayer: 4,
  redHerringPerPlayer: 1,
};

// Progress denominator shown in the tracker. Normalized & identical for both
// players (3 shared + 4 private) so the count leaks nothing about the opponent.
export const PROGRESS_TOTAL = CLUE_DISTRIBUTION.shared + CLUE_DISTRIBUTION.privatePerPlayer; // 7

export const SUSPECT_COUNT = 6;
export const WEAPON_COUNT = 6;

// Reconnect grace window (ms) before a dropped player forfeits / game cancels.
export const RECONNECT_WINDOW_MS = 30_000;
