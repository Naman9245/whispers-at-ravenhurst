// AI case generation (Phase 1 step 6).
//
// At game start the server generates the full case JSON, runs validateCase()
// from shared/caseSchema.js, and falls back to ./fallbackCase.json so the game
// is always playable — including for portfolio reviewers without an API key.
// The live claude-opus-4-8 call (with retry x3) slots into generateCase() next.
//
// The API key is read from process.env.ANTHROPIC_API_KEY on the SERVER ONLY and
// is never sent to a client. The generated solution stays server-side until the
// game ends.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateCase } from "../../shared/caseSchema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadFallbackCase() {
  const raw = await readFile(join(__dirname, "fallbackCase.json"), "utf8");
  return JSON.parse(raw);
}

export async function generateCase({ devMode } = {}) {
  // Live generation (claude-opus-4-8 + retry x3) slots in here next; it will run
  // its result through validateCase() and fall back on any failure. For now we
  // always serve the baked case — validated so a bad edit fails loudly in dev.
  void devMode;
  const fallback = await loadFallbackCase();
  const res = validateCase(fallback);
  if (!res.ok) {
    console.error("[ai] WARNING: fallback case failed validation:", res.reasons.join("; "));
  }
  return fallback;
}
