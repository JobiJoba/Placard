/** Exercise the real Bash installer with local release assets and an isolated project. */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const project = `placard-installer-${randomBytes(6).toString("hex")}`
const work = mkdtempSync(join(tmpdir(), project))
const destination = join(work, "installation")
const bin = join(work, "bin")
mkdirSync(bin)
const docker = (args) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
// Only the test's project name, image source, and dynamic host port differ from a release.
const source = readFileSync(join(root, "scripts/install.sh"), "utf8")
  .replaceAll("@PLACARD_RELEASE@", "v1.2.3")
  .replaceAll("@PLACARD_REPOSITORY@", "JobiJoba/Placard")
  .replaceAll(
    "@PLACARD_COMPOSE_API@",
    "https://api.github.com/repos/JobiJoba/Placard/releases/assets/101",
  )
  .replaceAll(
    "@PLACARD_ENV_API@",
    "https://api.github.com/repos/JobiJoba/Placard/releases/assets/102",
  )
  .replaceAll("project=placard", `project=${project}`)
  .replaceAll(
    "placard_pgdata placard_media placard_modules placard_caddy_data placard_caddy_config",
    `${project}_pgdata ${project}_media ${project}_modules ${project}_caddy_data ${project}_caddy_config`,
  )
  .replaceAll("--project-name placard", `--project-name ${project}`)
writeFileSync(join(work, "install.sh"), source)
const compose = readFileSync(join(root, "compose.ghcr.yaml"), "utf8")
  .replace("name: placard", `name: ${project}`)
  .replace(/image: \$\{PLACARD_IMAGE[^\n]+/, "image: placard:dr-check")
  .replace("pull_policy: always", "pull_policy: never")
  .replace(/\$\{PLACARD_PORT:-3000\}/, "0")
writeFileSync(join(work, "docker-compose.yml"), compose)
writeFileSync(join(work, "example.env"), readFileSync(join(root, ".env.example")))
writeFileSync(
  join(bin, "curl"),
  `#!/bin/bash
url=''; out=''
while [ "$#" -gt 0 ]; do case "$1" in https:*) url=$1;; -o) shift; out=$1;; esac; shift; done
# Exercise fallback after a simulated GitHub release-route failure.
[[ "$url" != */releases/download/* ]] || exit 22
case "$url" in */assets/102) cp "$INSTALL_SMOKE_ASSETS/example.env" "$out";; */assets/101) cp "$INSTALL_SMOKE_ASSETS/docker-compose.yml" "$out";; *) exit 1;; esac
`,
  { mode: 0o755 },
)
const composeArgs = [
  "compose",
  "-p",
  project,
  "--env-file",
  join(destination, ".env"),
  "-f",
  join(destination, "docker-compose.yml"),
]
try {
  docker(["image", "inspect", "placard:dr-check"])
  execFileSync(
    "bash",
    [join(work, "install.sh"), "--non-interactive", "--directory", destination],
    {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, INSTALL_SMOKE_ASSETS: work },
      stdio: "inherit",
      timeout: 300_000,
    },
  )
  const rows = docker([...composeArgs, "ps", "--format", "json"]).trim()
  const services = rows.startsWith("[")
    ? JSON.parse(rows)
    : rows.split("\n").map((line) => JSON.parse(line))
  assert.equal(services.length, 3)
  for (const service of services) assert.equal(service.Health, "healthy", service.Service)
  const address = docker([...composeArgs, "port", "app", "3000"]).trim()
  const response = await fetch(`http://${address}/api/health`)
  assert.equal(response.status, 200)
  console.log("Installer smoke check passed: app, worker, db healthy; /api/health returned 200")
} finally {
  // Remove only this test's randomly named resources, never the user's placard project.
  try {
    docker([
      "compose",
      "-p",
      project,
      "-f",
      join(work, "docker-compose.yml"),
      "--env-file",
      join(destination, ".env"),
      "down",
      "-v",
    ])
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
