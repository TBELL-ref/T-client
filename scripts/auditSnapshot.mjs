const FORBIDDEN = [
  /"private_key"\s*:/i,
  /"type"\s*:\s*"service_account"/i,
  /ghp_[a-zA-Z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/
];

import { readFile } from "node:fs/promises";

const file = process.argv[2] ?? "data/snapshot.json";

const raw = await readFile(file, "utf8");
for (const pattern of FORBIDDEN) {
  if (pattern.test(raw)) {
    console.error(`Audit failed: sensitive pattern in ${file}`);
    process.exit(1);
  }
}
console.log(`Audit passed: ${file}`);
