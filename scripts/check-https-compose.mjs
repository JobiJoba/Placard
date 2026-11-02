/** Check release Compose discovery, then exercise Caddy TLS/proxying with a local test CA. */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { get as httpGet } from "node:http"
import { get } from "node:https"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const work = mkdtempSync(join(tmpdir(), "placard-https-"))
const project = `placard-https-${randomBytes(6).toString("hex")}`
const docker = (args) => execFileSync("docker", args, { cwd: work, encoding: "utf8" })
const compose = (...args) => docker(["compose", "-p", project, ...args])
const overlay = readFileSync(join(root, "compose.https.yaml"), "utf8")
const caddyfile = readFileSync(join(root, "Caddyfile"), "utf8")
writeFileSync(join(work, "docker-compose.yml"), readFileSync(join(root, "compose.ghcr.yaml")))
writeFileSync(join(work, "docker-compose.override.yml"), overlay)
writeFileSync(join(work, "Caddyfile"), caddyfile)
writeFileSync(
  join(work, ".env"),
  "POSTGRES_PASSWORD=test-password\nBETTER_AUTH_SECRET=test-secret\nPUBLIC_URL=https://places.example.com\nPLACARD_DOMAIN=places.example.com\nPLACARD_BIND_ADDRESS=127.0.0.1\n",
)
try {
  // No -f flags: normal maintenance commands must discover the HTTPS service.
  const config = JSON.parse(compose("config", "--format", "json"))
  assert.equal(config.services.app.environment.PUBLIC_URL, "https://places.example.com")
  assert.equal(config.services.app.ports[0].host_ip, "127.0.0.1")
  assert.deepEqual(
    config.services.caddy.ports.map((port) => port.target),
    [80, 443],
  )
  assert.equal(config.services.caddy.environment.PLACARD_DOMAIN, "places.example.com")
  assert.ok(config.services.caddy.volumes.some((volume) => volume.target === "/data"))

  // Isolated proxy test: use a static backend instead of starting Placard's database.
  // Random loopback ports and an internal CA avoid public DNS and ACME requests.
  writeFileSync(
    join(work, "docker-compose.yml"),
    `services:
  app:
    image: ${config.services.caddy.image}
    command: ["caddy", "file-server", "--listen", ":3000", "--root", "/usr/share/caddy"]
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000"]
      interval: 1s
      timeout: 3s
      retries: 30
`,
  )
  writeFileSync(
    join(work, "docker-compose.override.yml"),
    overlay.replace('"80:80"', '"127.0.0.1::80"').replace('"443:443"', '"127.0.0.1::443"'),
  )
  writeFileSync(join(work, "Caddyfile"), caddyfile.replace("{\n", "{\n\ttls internal\n"))
  compose("up", "-d", "--wait", "--wait-timeout", "60")
  const httpAddress = compose("port", "caddy", "80").trim()
  const redirect = await new Promise((resolveResponse, reject) => {
    httpGet(`http://${httpAddress}/test`, { headers: { Host: "places.example.com" } }, (res) => {
      res.resume()
      resolveResponse(res)
    }).on("error", reject)
  })
  assert.equal(redirect.statusCode, 308)
  assert.equal(redirect.headers.location, "https://places.example.com/test")
  const httpsPort = Number(compose("port", "caddy", "443").trim().split(":").at(-1))
  const response = await new Promise((resolveResponse, reject) => {
    const request = get(
      {
        hostname: "127.0.0.1",
        port: httpsPort,
        servername: "places.example.com",
        headers: { Host: "places.example.com" },
        rejectUnauthorized: false,
      },
      (res) => {
        let body = ""
        res.setEncoding("utf8")
        res.on("data", (chunk) => {
          body += chunk
        })
        res.on("end", () => resolveResponse({ status: res.statusCode, body }))
      },
    )
    request.setTimeout(10_000, () => request.destroy(new Error("HTTPS request timed out")))
    request.on("error", reject)
  })
  assert.equal(response.status, 200)
  assert.match(response.body, /Caddy/)
  console.log(
    "HTTPS checks passed: Compose discovery, loopback app binding, HTTP redirect, TLS and proxy response",
  )
} finally {
  try {
    compose("down", "-v")
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
