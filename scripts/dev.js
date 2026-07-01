// Runs client + server together with one `npm run dev`.
//
// FIRST it FREES the dev ports — killing any process already bound to them. This
// kills the "zombie server" trap: a stale long-lived instance on :3001 keeps
// serving OLD code, so you unknowingly test against the past and chase ghosts.
// (A 300h zombie once faked a "game won't end at 0:00" bug — the fresh code was
// fine.) Guarding here makes `npm run dev` always the source of truth.
import { spawn, execSync } from "node:child_process";

const PORTS = [3001, 5173]; // server (Express + Socket.io), client (Vite)
const isWin = process.platform === "win32";

// Best-effort, dependency-free: PIDs currently LISTENing on a TCP port.
function listenerPids(port) {
  try {
    if (isWin) {
      const out = execSync("netstat -ano -p tcp", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const pids = new Set();
      for (const line of out.split("\n")) {
        const p = line.trim().split(/\s+/); // [proto, local, foreign, STATE, pid]
        if (p.length < 5 || p[3] !== "LISTENING") continue;
        const localPort = Number(p[1].slice(p[1].lastIndexOf(":") + 1)); // handles [::]:5173
        if (localPort === port) pids.add(p[4]);
      }
      return [...pids];
    }
    // macOS / Linux
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return [...new Set(out.split("\n").map((s) => s.trim()).filter(Boolean))];
  } catch {
    return []; // nothing listening (tool exits non-zero) or the tool is unavailable
  }
}

function kill(pid) {
  try {
    if (isWin) execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    else process.kill(Number(pid), "SIGKILL");
    return true;
  } catch {
    return false;
  }
}

function freePorts() {
  const self = String(process.pid);
  let killedAny = false;
  for (const port of PORTS) {
    for (const pid of listenerPids(port)) {
      if (!pid || pid === "0" || pid === self) continue;
      const ok = kill(pid);
      killedAny = true;
      console.log(
        `\x1b[33m[dev] port ${port} was in use — killed stale process pid ${pid}` +
          `${ok ? " (zombie server cleared)" : " (KILL FAILED — kill it manually)"}\x1b[0m`
      );
    }
  }
  if (!killedAny) console.log(`\x1b[32m[dev] ports ${PORTS.join(", ")} clear — no zombies.\x1b[0m`);
}

freePorts();

const run = (name, cmd, args, color) => {
  const p = spawn(cmd, args, { shell: true });
  const tag = `\x1b[${color}m[${name}]\x1b[0m`;
  p.stdout.on("data", (d) => process.stdout.write(`${tag} ${d}`));
  p.stderr.on("data", (d) => process.stderr.write(`${tag} ${d}`));
};
run("server", "npm", ["--prefix", "server", "run", "dev"], 36);
run("client", "npm", ["--prefix", "client", "run", "dev"], 35);
