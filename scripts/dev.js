// Runs client + server together with one `npm run dev`.
import { spawn } from "node:child_process";
const run = (name, cmd, args, color) => {
  const p = spawn(cmd, args, { shell: true });
  const tag = `\x1b[${color}m[${name}]\x1b[0m`;
  p.stdout.on("data", (d) => process.stdout.write(`${tag} ${d}`));
  p.stderr.on("data", (d) => process.stderr.write(`${tag} ${d}`));
};
run("server", "npm", ["--prefix", "server", "run", "dev"], 36);
run("client", "npm", ["--prefix", "client", "run", "dev"], 35);
