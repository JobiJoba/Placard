#!/usr/bin/env node
/**
 * Validates (and optionally regenerates) compose.yaml.
 *
 * Placard keeps a hand-maintained compose.yaml as the self-hoster source of
 * truth (PostGIS image, healthchecks, media volume). Aspire can publish a
 * compose file for comparison when PLACARD_COMPOSE_FROM_ASPIRE=1.
 */
import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const outputDir = join(root, "aspire-output")
const committed = join(root, "compose.yaml")

if (!existsSync(committed)) {
  console.error("compose.yaml is missing from the repo root.")
  process.exit(1)
}

const body = readFileSync(committed, "utf8")
if (!body.includes("imresamu/postgis:18-3.6")) {
  console.error("compose.yaml must use the PostGIS image imresamu/postgis:18-3.6")
  process.exit(1)
}
if (!body.includes("apps/server/src/worker.ts")) {
  console.error("compose.yaml worker command must point at apps/server/src/worker.ts")
  process.exit(1)
}

if (process.env.PLACARD_COMPOSE_FROM_ASPIRE !== "1") {
  console.log(
    "compose.yaml is hand-maintained for self-hosters (Coolify). Markers OK.\n" +
      "Set PLACARD_COMPOSE_FROM_ASPIRE=1 to attempt Aspire publish into aspire-output/.",
  )
  process.exit(0)
}

rmSync(outputDir, { recursive: true, force: true })
mkdirSync(outputDir, { recursive: true })

const result = spawnSync("aspire", ["publish", "-o", outputDir], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const generated = join(outputDir, "docker-compose.yaml")
if (!existsSync(generated)) {
  console.error("aspire publish did not produce docker-compose.yaml")
  process.exit(1)
}

copyFileSync(generated, committed)
console.log("Updated compose.yaml from Aspire publish output.")
