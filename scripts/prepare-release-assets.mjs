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
const outDir = process.env.PLACARD_RELEASE_OUTPUT_DIR || join(root, "dist-release")

const raw = process.argv[2] || process.env.PLACARD_RELEASE_TAG || process.env.GITHUB_REF_NAME || ""
const version = raw.replace(/^v/, "")
if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)) {
  console.error("Usage: prepare-release-assets.mjs <v0.1.0|0.1.0>")
  process.exit(1)
}

const owner = (process.env.GITHUB_REPOSITORY_OWNER || "placard-app").toLowerCase()
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
copyFileSync(join(root, "compose.https.yaml"), join(outDir, "docker-compose.override.yml"))
copyFileSync(join(root, "Caddyfile"), join(outDir, "Caddyfile"))
copyFileSync(join(root, "scripts", "placard-recovery.py"), join(outDir, "placard-recovery.py"))

console.log(`Wrote ${outDir}/docker-compose.yml (default ${image})`)
console.log(`Wrote ${outDir}/example.env`)

const repository = process.env.GITHUB_REPOSITORY || "placard-app/core"
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("Invalid repository")
const apiTokens = {
  "docker-compose.yml": "@PLACARD_COMPOSE_API@",
  "example.env": "@PLACARD_ENV_API@",
  "docker-compose.override.yml": "@PLACARD_HTTPS_API@",
  Caddyfile: "@PLACARD_CADDY_API@",
}
const releaseTag = raw.startsWith("v") ? raw : `v${version}`
const metadataFile = process.env.PLACARD_RELEASE_METADATA
const assetUrls = {}
if (metadataFile) {
  const release = JSON.parse(readFileSync(metadataFile, "utf8"))
  if (release.tag_name !== releaseTag) throw new Error("Release metadata tag does not match")
  for (const name of Object.keys(apiTokens)) {
    const asset = release.assets.find((entry) => entry.name === name)
    const prefix = `https://api.github.com/repos/${repository}/releases/assets/`
    if (
      asset?.state !== "uploaded" ||
      asset.size <= 0 ||
      !asset.url?.startsWith(prefix) ||
      !/^\d+$/.test(asset.url.slice(prefix.length))
    )
      throw new Error(`Missing or invalid published asset: ${name}`)
    assetUrls[name] = asset.url
  }
}
for (const script of ["install.sh", "install.ps1"]) {
  let source = readFileSync(join(root, "scripts", script), "utf8")
    .replaceAll("@PLACARD_RELEASE@", raw.startsWith("v") ? raw : `v${version}`)
    .replaceAll("@PLACARD_REPOSITORY@", repository)
  for (const [name, token] of Object.entries(apiTokens)) {
    source = source.replaceAll(token, assetUrls[name] || "")
  }
  writeFileSync(join(outDir, script), source)
}
