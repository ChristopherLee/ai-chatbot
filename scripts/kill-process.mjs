import { spawnSync } from "node:child_process";

function fail(message, details) {
  console.error(message);

  if (details) {
    console.error(details.trim());
  }

  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    fail(`Failed to run ${command}.`, result.error.message);
  }

  return result;
}

const pidArg = process.argv[2];

if (!pidArg) {
  fail("Usage: node scripts/kill-process.mjs <pid>");
}

if (!/^\d+$/.test(pidArg)) {
  fail(`PID must be a positive integer. Received: ${pidArg}`);
}

const pid = Number(pidArg);

if (!Number.isSafeInteger(pid) || pid <= 0) {
  fail(`PID must be a positive integer. Received: ${pidArg}`);
}

if (process.platform === "win32") {
  const nameResult = run("powershell.exe", [
    "-NoProfile",
    "-Command",
    [
      "$ErrorActionPreference = 'SilentlyContinue'",
      `$process = Get-Process -Id ${pid}`,
      "if ($process) { Write-Output $process.ProcessName }",
    ].join("; "),
  ]);

  const killResult = run("taskkill", ["/PID", String(pid), "/T", "/F"]);

  if ((killResult.status ?? 1) !== 0) {
    const details =
      killResult.stderr.trim() ||
      killResult.stdout.trim() ||
      `No running process found for PID ${pid}.`;

    fail(`Unable to stop PID ${pid}.`, details);
  }

  const name = nameResult.stdout.trim();
  console.log(
    `Stopped process tree for PID ${pid}${name ? ` (${name})` : ""}.`
  );
  process.exit(0);
}

try {
  process.kill(pid, "SIGKILL");
  console.log(`Stopped PID ${pid}.`);
} catch (error) {
  const details =
    error instanceof Error ? error.message : "Unknown process termination error.";

  fail(`Unable to stop PID ${pid}.`, details);
}
