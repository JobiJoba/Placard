/** Mirror verified published installers so the first download avoids the release URL route. */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const repository = process.env.GITHUB_REPOSITORY || "JobiJoba/Placard"
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("Invalid repository")
const release = JSON.parse(
  execFileSync("gh", ["api", `repos/${repository}/releases/latest`], { encoding: "utf8" }),
)
if (release.draft || release.prerelease) throw new Error("Expected a published stable release")
const publicDir = resolve(import.meta.dirname, "../public")
mkdirSync(publicDir, { recursive: true })
for (const name of ["install.sh", "install.ps1"]) {
  const asset = release.assets.find((entry) => entry.name === name)
  if (
    asset?.state !== "uploaded" ||
    !Number.isSafeInteger(asset.id) ||
    asset.size <= 0 ||
    !/^sha256:[a-f0-9]{64}$/.test(asset.digest)
  ) {
    throw new Error(`Missing or invalid installer: ${name}`)
  }
  const content = execFileSync("gh", [
    "api",
    `repos/${repository}/releases/assets/${asset.id}`,
    "-H",
    "Accept: application/octet-stream",
  ])
  const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`
  if (digest !== asset.digest || content.length !== asset.size)
    throw new Error(`Installer integrity check failed: ${name}`)
  writeFileSync(resolve(publicDir, name), content)
  console.log(`Verified ${release.tag_name}/${name} for website download`)
}
