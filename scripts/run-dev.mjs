import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { config } from "dotenv";

const command = process.platform === "win32" ? "corepack.cmd" : "corepack";
const useShell = process.platform === "win32";

if (!existsSync(".env.local")) {
  console.error("Missing .env.local.");
  console.error(
    "Copy .env.example to .env.local and set at least POSTGRES_URL and AUTH_SECRET."
  );
  process.exit(1);
}

config({ path: ".env.local" });

if (!process.env.POSTGRES_URL) {
  console.error("POSTGRES_URL is required in .env.local.");
  process.exit(1);
}

if (!process.env.AUTH_SECRET) {
  console.error("AUTH_SECRET is required in .env.local.");
  process.exit(1);
}

const migrate = spawnSync(
  command,
  ["pnpm", "exec", "tsx", "lib/db/migrate.ts"],
  {
    stdio: "inherit",
    shell: useShell,
    env: process.env,
  }
);

if (migrate.error) {
  throw migrate.error;
}

if ((migrate.status ?? 1) !== 0) {
  process.exit(migrate.status ?? 1);
}

const devServer = spawn(command, ["pnpm", "dev"], {
  stdio: "inherit",
  shell: useShell,
  env: process.env,
});

devServer.on("error", (error) => {
  throw error;
});

devServer.on("exit", (code) => {
  process.exit(code ?? 0);
});
