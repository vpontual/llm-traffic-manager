import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync(".git")) {
  console.log("[hooks] No .git directory found; skipping hook installation");
  process.exit(0);
}

const probe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
  stdio: "ignore",
});

if (probe.status !== 0) {
  console.log("[hooks] Not in a writable git work tree; skipping hook installation");
  process.exit(0);
}

const setPath = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
  stdio: "ignore",
});

if (setPath.status === 0) {
  console.log("[hooks] Installed repo hooks at .githooks");
} else {
  console.log("[hooks] Could not write git config here; run `git config core.hooksPath .githooks` locally");
}
