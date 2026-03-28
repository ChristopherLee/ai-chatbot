import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

const command = process.platform === "win32" ? "corepack.cmd" : "corepack";

const result = spawnSync(
  command,
  ["pnpm", "exec", "playwright", "test", ...args],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      PLAYWRIGHT: "true",
    },
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
