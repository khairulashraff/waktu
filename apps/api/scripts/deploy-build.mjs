// Build-and-push pipeline for the Waktu API.
//
//   node scripts/deploy-build.mjs      (run from the api/ directory)
//
// One command on the build machine:
//   1. stamps one timestamped image tag,
//   2. builds the API image for the target architecture (cross-builds via buildx),
//   3. pushes it to the configured registry, and
//   4. renders docker-compose.yaml -> docker-compose.deploy.yaml with the tag and
//      every value baked in, so the target host is a pure pull-and-run — it never builds.
//
// Then copy the generated file to the target host and:
//   docker compose -f docker-compose.deploy.yaml up -d
//
// Config is read from an optional deploy env file (default `.env.deploy`, override
// with WAKTU_ENV_FILE) kept separate from any dev `.env`. Every knob also has a
// sensible default, so a plain run with no env file still produces a valid stack.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

// This script lives in apps/api/scripts/. The app dir (template + generated file
// + env file live here) is one level up; the monorepo root (the Docker build
// context, so the pnpm workspace + lockfile are in scope) is three levels up.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(projectRoot, "..", "..");
const DOCKERFILE = "apps/api/Dockerfile";

const TEMPLATE = "docker-compose.yaml";
const GENERATED = "docker-compose.deploy.yaml";
const ENV_FILE = process.env.WAKTU_ENV_FILE ?? ".env.deploy";

// Registry the image is pushed to. Override WAKTU_REGISTRY to point elsewhere.
const REGISTRY = process.env.WAKTU_REGISTRY ?? "localhost:5000";

// The target host's CPU architecture. Many small/ARM boxes are arm64; for an x86
// host set WAKTU_PLATFORM=linux/amd64. buildx emulates the target arch via QEMU.
const PLATFORM = process.env.WAKTU_PLATFORM ?? "linux/arm64";

const IMAGE_NAME = "waktu-api";

// One tag per run, minute precision so same-day rebuilds stay distinct. Never
// `latest`: a changing tag is what makes `compose up -d` recreate the service.
function buildTag(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}`
  );
}

// Docker is run from the monorepo root so the workspace is the build context.
function run(command, args) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd: repoRoot, stdio: "inherit" });
}

// Minimal .env reader: KEY=VALUE lines, `#` comments and blanks skipped, optional
// surrounding quotes stripped. Single-line values only — enough for the deploy knobs.
function readDotEnv(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    values[key] = raw
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .replace(/^'(.*)'$/, "$1");
  }
  return values;
}

// Resolve every ${VAR} / ${VAR:-default} against `values`: a non-empty value
// wins, else the inline default, else the var is reported missing. Errors out
// listing any required-but-unset vars so a half-filled artifact never ships.
function render(template, values) {
  const missing = new Set();
  const out = template.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g,
    (_match, name, fallback) => {
      const value = values[name];
      if (value !== undefined && value !== "") return value;
      if (fallback !== undefined) return fallback;
      missing.add(name);
      return "";
    },
  );
  if (missing.size > 0) {
    throw new Error(
      `Cannot render ${GENERATED}: these variables are unset in ${ENV_FILE} and have no default: ` +
        `${[...missing].join(", ")}. Set them in ${ENV_FILE} and re-run.`,
    );
  }
  return out;
}

const tag = buildTag();
console.log(`Build tag: ${tag}`);

// Render first, before the expensive build/push, so a missing required var fails
// fast rather than after the image is already pushed. WAKTU_TAG is injected here;
// everything else comes from the (optional) deploy env file or its inline default.
const values = {
  ...readDotEnv(join(projectRoot, ENV_FILE)),
  WAKTU_TAG: tag,
  WAKTU_REGISTRY: REGISTRY,
};
const rendered = render(
  readFileSync(join(projectRoot, TEMPLATE), "utf8"),
  values,
);

const ref = `${REGISTRY}/${IMAGE_NAME}:${tag}`;
run("docker", ["build", "--platform", PLATFORM, "-f", DOCKERFILE, "-t", ref, "."]);
run("docker", ["push", ref]);

writeFileSync(join(projectRoot, GENERATED), rendered);

console.log(`\nWrote ${GENERATED} (tag ${tag}).`);
console.log(
  `Deploy it:  scp ${GENERATED} <host>:  &&  ssh <host> "docker compose -f ${GENERATED} up -d"`,
);
