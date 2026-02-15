import { spawnSync } from "node:child_process";

const project = process.env.SMOKE_DOCKER_PROJECT || "ollamaproxy-smoke";
const appUrl = process.env.BASE_URL || "http://localhost:43334";
const proxyUrl = process.env.PROXY_URL || "http://localhost:41434";

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
  });

  if (result.status !== 0) {
    const rendered = `${command} ${args.join(" ")}`;
    throw new Error(`Command failed: ${rendered}`);
  }
}

function composeArgs(...args) {
  return [
    "compose",
    "-p",
    project,
    "--profile",
    "dev",
    ...args,
  ];
}

try {
  run("docker", composeArgs("up", "-d", "--build", "db-dev", "app-dev"));

  const smokeEnv = {
    ...process.env,
    BASE_URL: appUrl,
    PROXY_URL: proxyUrl,
    SMOKE_USERNAME:
      process.env.SMOKE_USERNAME || process.env.ADMIN_USERNAME || "smoke-admin",
    SMOKE_PASSWORD:
      process.env.SMOKE_PASSWORD || process.env.ADMIN_PASSWORD || "smoke-password",
  };

  run("node", ["scripts/smoke.mjs"], smokeEnv);
} finally {
  run("docker", composeArgs("down", "--volumes", "--remove-orphans"));
}
