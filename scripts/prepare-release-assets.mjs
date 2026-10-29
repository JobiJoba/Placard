#!/usr/bin/env node
/**
 * Builds Immich-style install files for a GitHub Release:
 *   docker-compose.yml  — compose.ghcr.yaml with image default pinned to the release tag
 *   example.env         — copy of .env.example
 *
 * Usage: node scripts/prepare-release-assets.mjs [v0.1.0|0.1.0]
 * Env:   PLACARD_RELEASE_TAG or GITHUB_REF_NAME
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const outDir = join(root, "dist-release")

const raw = process.argv[2] || process.env.PLACARD_RELEASE_TAG || process.env.GITHUB_REF_NAME || ""
const version = raw.replace(/^v/, "")
if (!version) {
  console.error("Usage: prepare-release-assets.mjs <v0.1.0|0.1.0>")
  process.exit(1)
}

const owner = (process.env.GITHUB_REPOSITORY_OWNER || "jobijoba").toLowerCase()
const image = `ghcr.io/${owner}/placard:${version}`

mkdirSync(outDir, { recursive: true })

let compose = readFileSync(join(root, "compose.ghcr.yaml"), "utf8")
compose = compose.replace(
  /image: \$\{PLACARD_IMAGE:-ghcr\.io\/[^:]+:nightly\}/,
  `image: \${PLACARD_IMAGE:-${image}}`,
)
compose = compose.replace(
  /# Pin a release when you have one.*Default is nightly.*\n/,
  `# Release ${version} — default image is ${image}\n# Override with PLACARD_IMAGE=…:nightly to track main.\n`,
)
writeFileSync(join(outDir, "docker-compose.yml"), compose)
copyFileSync(join(root, ".env.example"), join(outDir, "example.env"))

console.log(`Wrote ${outDir}/docker-compose.yml (default ${image})`)
console.log(`Wrote ${outDir}/example.env`)
