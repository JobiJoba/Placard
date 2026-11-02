#!/usr/bin/env node
/** Exercise disaster recovery against an isolated Compose project, never an existing install. */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const project = `placard-dr-check-${randomBytes(6).toString("hex")}`
const work = mkdtempSync(join(tmpdir(), `${project}-`))
const envFile = join(work, ".env")
const env = {
  ...process.env,
  POSTGRES_PASSWORD: randomBytes(24).toString("hex"),
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
  PUBLIC_URL: "http://localhost:3000",
  PLACARD_PORT: "127.0.0.1:0",
  PLACARD_VERSION: "dr-check",
  GOOGLE_MAPS_API_KEY: "",
  MCP_ENABLED: "true",
}
writeFileSync(envFile, "# Isolated recovery check; configuration supplied through the process.\n")
const compose = (...args) => [
  "compose",
  "--env-file",
  envFile,
  "-f",
  join(root, "compose.yaml"),
  "-p",
  project,
  ...args,
]
const docker = (args, input) =>
  execFileSync("docker", args, {
    cwd: root,
    env,
    input,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 300_000,
    stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
  })
const run = (...args) => docker(compose(...args))
const archive = (dir) =>
  run("run", "--rm", "--no-deps", "-T", "app", "tar", "czf", "-", "-C", dir, ".")
const restoreArchive = (dir, data) =>
  docker(compose("run", "--rm", "--no-deps", "-T", "app", "tar", "xzf", "-", "-C", dir), data)
const digest = (data) => createHash("sha256").update(data).digest("hex")
let baseUrl
let cookie = ""
const request = async (path, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      origin: env.PUBLIC_URL,
      cookie,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  })
  assert.equal(response.status, 200, `${path}: ${await response.clone().text()}`)
  const cookies = response.headers.getSetCookie()
  if (cookies.length) cookie = cookies.map((value) => value.split(";")[0]).join("; ")
  return response
}
const start = () => {
  run("up", "-d", "--wait", "--wait-timeout", "180")
  const published = run("port", "app", "3000").toString().trim()
  baseUrl = `http://${published}`
}

try {
  console.log(`Starting isolated recovery check: ${project}`)
  // CI loads placard:dr-check from its cached Docker build before running this script.
  if (!process.argv.includes("--skip-build")) run("build", "app")
  start()
  const credentials = { email: "recovery@example.com", password: randomBytes(24).toString("hex") }
  await request("/api/auth/sign-up/email", { ...credentials, name: "Recovery check" })
  const saved = await (
    await request("/api/places/manual", {
      name: "Recovery check cafe",
      category: "cafe",
      location: { lat: 50.85, lng: 4.35 },
      address: "Brussels",
    })
  ).json()
  const placeId = saved.place.id
  const media = await (
    await request(`/api/media/places/${placeId}`, {
      kind: "dish",
      caption: "Recovery check photo",
      filename: "photo.png",
      mimeType: "image/png",
      contentBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
    })
  ).json()
  const photoHash = digest(
    Buffer.from(await (await request(`/api/media/${media.id}/file`)).arrayBuffer()),
  )
  const thumbHash = digest(
    Buffer.from(await (await request(`/api/media/${media.id}/thumb`)).arrayBuffer()),
  )
  // A marker checks preservation of the module volume without installing executable code.
  run("exec", "-T", "app", "sh", "-c", "printf recovery-check > /data/modules/recovery-check.txt")

  console.log("Stopping writers; backing up database, photos, and module files.")
  run("stop", "app", "worker")
  const database = run("exec", "-T", "db", "pg_dump", "-U", "placard", "-Fc", "placard")
  const photos = archive("/data/media")
  const modules = archive("/data/modules")
  writeFileSync(join(work, "database.dump"), database)
  writeFileSync(join(work, "media.tgz"), photos)
  writeFileSync(join(work, "modules.tgz"), modules)

  console.log("Removing only the generated check project's volumes; restoring into fresh volumes.")
  run("down", "--volumes")
  run("up", "-d", "--wait", "--wait-timeout", "90", "db")
  docker(
    compose(
      "exec",
      "-T",
      "db",
      "pg_restore",
      "-U",
      "placard",
      "-d",
      "placard",
      "--clean",
      "--if-exists",
      "--no-owner",
      "--exit-on-error",
    ),
    database,
  )
  restoreArchive("/data/media", photos)
  restoreArchive("/data/modules", modules)
  start()
  cookie = ""
  await request("/api/auth/sign-in/email", credentials)
  const restored = await (await request(`/api/places/${placeId}`)).json()
  assert.equal(restored.name, "Recovery check cafe")
  assert.equal(
    digest(Buffer.from(await (await request(`/api/media/${media.id}/file`)).arrayBuffer())),
    photoHash,
  )
  assert.equal(
    digest(Buffer.from(await (await request(`/api/media/${media.id}/thumb`)).arrayBuffer())),
    thumbHash,
  )
  assert.equal(
    run("exec", "-T", "app", "cat", "/data/modules/recovery-check.txt").toString(),
    "recovery-check",
  )
  console.log(
    "PASS: fresh Compose install, account login, place, photo, thumbnail, and module files survive wipe/restore.",
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  try {
    run("down", "--volumes", "--remove-orphans")
    rmSync(work, { recursive: true, force: true })
  } catch {
    console.error(
      `Cleanup failed. Remove the isolated project ${project} and temporary files at ${work}.`,
    )
    process.exitCode = 1
  }
}
