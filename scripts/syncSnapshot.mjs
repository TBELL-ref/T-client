import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const src = process.argv[2] ?? resolve(process.cwd(), "data", "snapshot.json");
const targets = [
  resolve(process.cwd(), "docs", "data", "snapshot.json"),
  resolve(process.cwd(), "data", "snapshot.json")
];

async function main() {
  const raw = await readFile(src, "utf8");
  JSON.parse(raw);
  for (const target of targets) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, raw, "utf8");
    console.log(`Synced: ${target}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
