/**
 * Starts a throwaway PostGIS container and the real server on top of it, so
 * Playwright always sees a fresh install. Used as Playwright's `webServer`.
 */
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { PostgreSqlContainer } from "@testcontainers/postgresql"

const POSTGIS_IMAGE = "imresamu/postgis:18-3.6"
const serverDir = fileURLToPath(new URL("..", import.meta.url))
const port = process.env.PORT ?? "3100"

const container = await new PostgreSqlContainer(POSTGIS_IMAGE).start()

const server = spawn(process.execPath, ["src/main.ts"], {
  cwd: serverDir,
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: container.getConnectionUri(),
    BETTER_AUTH_SECRET: "e2e-only-secret-0123456789abcdefghijklmnop",
    PORT: port,
    PUBLIC_URL: `http://localhost:${port}`,
    WEB_DIST_DIR: "../web/dist",
    PLACARD_FAKE_GOOGLE: "true",
  },
})

let stopping = false
const stop = async (code: number) => {
  if (stopping) return
  stopping = true
  server.kill("SIGTERM")
  await container.stop().catch(() => undefined)
  process.exit(code)
}

process.on("SIGTERM", () => void stop(0))
process.on("SIGINT", () => void stop(0))
server.on("exit", (code) => void stop(code ?? 1))
