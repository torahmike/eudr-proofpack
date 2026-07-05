import { execFileSync } from "node:child_process";

const command = process.platform === "win32" ? "npx.cmd" : "npx";

execFileSync(command, ["wrangler", "d1", "execute", "eudr-proofpack-db", "--local", "--file", "./scripts/seed.sql"], {
  stdio: "inherit",
});