// Runs every server suite with one command: `npm test` (from server/).
//
// Six suites talk to a live server on :3001, and they disagree on how it must be
// started: briefingClock/interrogation/lobbyFlow need WHISPERS_FAST_TIMERS=1,
// hotspots/lockout need =demo, and timerOff needs it UNSET. So each group gets a
// FRESH server in its own mode, stopped before the next group starts. That also
// closes the zombie-server trap from CLAUDE.md: if something is already bound to
// :3001 we refuse to run rather than test stale code.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL = "http://localhost:3001";
const SUITE_TIMEOUT_MS = 180_000;

const GROUPS = [
  { server: false, timers: null, suites: ["caseValidation", "accusation", "movement", "settings"] },
  { server: true, timers: "1", suites: ["lobbyFlow", "briefingClock", "interrogation"] },
  { server: true, timers: "demo", suites: ["hotspots", "lockout"] },
  { server: true, timers: null, suites: ["timerOff"] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function isUp() {
  try {
    await fetch(`${URL}/health`, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

function envFor(timers) {
  const env = { ...process.env };
  if (timers) env.WHISPERS_FAST_TIMERS = timers;
  else delete env.WHISPERS_FAST_TIMERS;
  return env;
}

async function startServer(timers) {
  // dotenv never overrides a variable that is already set, so an explicit empty
  // value keeps a local .env from sneaking fast timers into the timerOff run.
  const env = envFor(timers);
  if (!timers) env.WHISPERS_FAST_TIMERS = "";
  const child = spawn(process.execPath, ["index.js"], {
    cwd: SERVER_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));

  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) break;
    if (await isUp()) return child;
    await sleep(250);
  }
  child.kill();
  throw new Error(`server (WHISPERS_FAST_TIMERS=${timers ?? "unset"}) did not start:\n${output}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((r) => child.once("exit", r));
  child.kill();
  await exited;
  for (let i = 0; i < 20 && (await isUp()); i++) await sleep(250);
}

function runSuite(name, timers) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [join("test", `${name}.js`)], {
      cwd: SERVER_DIR,
      env: envFor(timers),
      stdio: "inherit",
    });
    const timer = setTimeout(() => child.kill(), SUITE_TIMEOUT_MS);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ name, timers, ok: code === 0, seconds: (Date.now() - started) / 1000, signal });
    });
  });
}

if (await isUp()) {
  console.error(`\n✗ Something is already running on ${URL}. Stop your dev server first —`);
  console.error("  these suites must run against a fresh server they started themselves.\n");
  process.exit(1);
}

const results = [];
for (const group of GROUPS) {
  const mode = group.server ? `server, WHISPERS_FAST_TIMERS=${group.timers ?? "unset"}` : "no server";
  console.log(`\n━━━ ${group.suites.join(", ")} (${mode}) ━━━`);
  const server = group.server ? await startServer(group.timers) : null;
  try {
    for (const suite of group.suites) {
      console.log(`\n▶ ${suite}`);
      results.push(await runSuite(suite, group.timers));
    }
  } finally {
    if (server) await stopServer(server);
  }
}

console.log("\n━━━ Summary ━━━");
for (const r of results) {
  const note = r.signal ? ` (killed after ${SUITE_TIMEOUT_MS / 1000}s)` : "";
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.name.padEnd(15)} ${r.seconds.toFixed(1).padStart(6)}s${note}`);
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n✗ ${failed.length} of ${results.length} suites failed\n` : `\n✓ All ${results.length} suites passed\n`);
process.exit(failed.length ? 1 : 0);
