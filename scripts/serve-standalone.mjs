// Runs the production standalone server (what Cloud Run runs), after copying
// the static assets next to it as Next.js expects. Usage: node scripts/serve-standalone.mjs
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const out = ".next/standalone";
if (!existsSync(`${out}/server.js`)) {
  console.error("No standalone build found. Run `npm run build` first.");
  process.exit(1);
}
cpSync(".next/static", `${out}/.next/static`, { recursive: true });
cpSync("public", `${out}/public`, { recursive: true });

const child = spawn(process.execPath, ["server.js"], { cwd: out, stdio: "inherit", env: { ...process.env, PORT: process.env.PORT || "3311", HOSTNAME: "127.0.0.1" } });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
