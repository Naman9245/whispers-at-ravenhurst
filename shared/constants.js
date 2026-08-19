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

// ---- host-chosen room settings (Phase 2.8) ---------------------------------
//
// The lobby lets whoever creates the room dial the game in, Among Us style, and
// `softTimer: null` means NO time limit at all — a deduction game shouldn't cut
// off a player who is genuinely solving it. Everything stays in SECONDS to match
// TIMER_PRESETS; Dev Mode's 60/20/30 isn't a whole number of minutes, so a
// minutes-based shape would need a conversion living in two places.
//
// ⚠️ `softTimer: null` is load-bearing in two spots that both silently invert the
// feature if unguarded: `scheduleForceResolve()` (null*1000 = 0 → resolves on the
// next tick) and `buildView().accusation.softMs` (same, → a frozen 0:00 clock).
export const SETTING_OPTIONS = {
  softTimer:      [null, 900, 1200, 1800, 2700],  // Off · 15 · 20 · 30 · 45 min
  accuseGate:     [0, 180, 300],                  // 0 · 3 · 5 min
  opponentWindow: [120, 180, 300],                // 2 · 3 · 5 min
  hotspotMarkers: [true, false],                  // the ambient magnifiers on the board
  sprint:         [true, false],
  rivalProgress:  [true, false],                  // whether you see their clue count
};

export const DEFAULT_SETTINGS = {
  ...TIMER_PRESETS.production,
  hotspotMarkers: true,
  sprint: true,
  rivalProgress: true,
};

export const DEV_SETTINGS = { ...DEFAULT_SETTINGS, ...TIMER_PRESETS.dev };

/**
 * Whitelist-only settings sanitizer. `room:create` had NO server-side validation,
 * so a crafted socket could send `accuseGate: -1` (instant accusations) or
 * `softTimer: 1e12`. Anything not exactly equal to a listed option is discarded
 * and the fallback's value is kept — never clamped toward the sent value.
 *
 * Shared so the lobby renders precisely the options the server will accept.
 */
export function sanitizeSettings(raw, fallback = DEFAULT_SETTINGS) {
  const out = { ...fallback };
  if (raw && typeof raw === "object") {
    for (const [key, allowed] of Object.entries(SETTING_OPTIONS)) {
      if (allowed.includes(raw[key])) out[key] = raw[key];
    }
  }
  return out;
}

// How close the player's FEET must get to a piece of furniture to examine it.
// Measured to the NEAREST POINT of the object's rect (not its centre), so solid
// furniture is examinable by standing flush against it. Shared so the client's
// proximity check and the reachability test can never drift apart.
export const EXAMINE_RADIUS = 26;

// Hotspot examination: how long the "searching" animation runs before the result
// modal opens. Shared so the canvas bubble's puff-out lands exactly on the commit.
export const SEARCH_MS = 2500;

// Suspect questioning budget (per suspect, per player) — CORE questions only.
// Questions unlocked by a clue you found are FREE, so investigating buys
// interrogation leverage instead of competing with it for the same budget.
export const QUESTION_CAP = 4;

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
