// Cross-platform launcher for the client deploy. Runs deploy.bat on Windows and
// deploy.sh elsewhere.
//
// Why not just "bash deploy.sh": on Windows `bash` resolves to the WSL stub
// (bash.exe), not Git Bash, so it fails when WSL has no distro. Routing by
// platform avoids depending on which `bash` is first in PATH.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === "win32";

// Invoke via the interpreter with an absolute script path — cmd.exe doesn't
// resolve a bare "deploy.bat" against the child cwd reliably.
const [command, args] = isWindows
  ? [process.env.ComSpec || "cmd.exe", ["/c", join(here, "deploy.bat")]]
  : ["bash", [join(here, "deploy.sh")]];

console.log(`Running ${isWindows ? "deploy.bat" : "deploy.sh"}...`);
const result = spawnSync(command, args, { cwd: here, stdio: "inherit" });

if (result.error) {
  console.error(`Failed to launch deploy script: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
