import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execSync("git ls-files -z", { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((file) => file !== "scripts/scan-secrets.ts");

const patterns = [
  { name: "chave privada", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "aws", re: /AKIA[0-9A-Z]{16}/ },
  { name: "stripe", re: /sk_live_[0-9a-zA-Z]{10,}/ },
  { name: "openai", re: /sk-proj-[A-Za-z0-9_-]{10,}/ },
  { name: "slack", re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "github", re: /ghp_[A-Za-z0-9]{20,}/ },
  { name: "jwt", re: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

let failed = false;
for (const file of files) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const pattern of patterns) {
    if (pattern.re.test(text)) {
      console.error(`${file}: possível segredo (${pattern.name})`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("Varredura de segredos ok.");
