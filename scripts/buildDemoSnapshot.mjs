import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(cmd, args) {
  return new Promise((done, fail) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? done() : fail(new Error(`exit ${code}`))));
  });
}

const out = resolve(__dirname, "../data/snapshot.json");
const buildScript = resolve(__dirname, "../../private-t-client/scripts/buildLocalSnapshot.mjs");
const syncScript = resolve(__dirname, "syncSnapshot.mjs");

await run(process.execPath, [buildScript, out]);
await run(process.execPath, [syncScript]);
