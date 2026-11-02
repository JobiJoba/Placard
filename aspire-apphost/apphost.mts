// Aspire TypeScript AppHost for Placard.
// Local orchestration + Docker Compose publish. Self-hosters use the committed compose.yaml.

import { networkInterfaces } from "node:os"
import { createBuilder } from "./.aspire/modules/aspire.mjs"

const builder = await createBuilder()

await builder.addDockerComposeEnvironment("compose")

const postgresUser = await builder.addParameter("postgres-user", {
  value: "placard",
  publishValueAsDefault: true,
})

const postgresPassword = await builder.addParameter("postgres-password", {
  value: "placard",
  secret: true,
})

const authSecret = await builder.addParameterWithGeneratedValue(
  "better-auth-secret",
  { minLength: 48, special: false },
  { secret: true, persist: true },
)

const postgres = await builder
  .addPostgres("db", { userName: postgresUser, password: postgresPassword })
  .withImage("imresamu/postgis", { tag: "18-3.6" })

await postgres.withDataVolume()

const placardDb = await postgres.addDatabase("placard")

const server = await builder
  .addNodeApp("server", "../apps/server", "src/main.ts")
  .withPnpm({ install: false })
  .withHttpEndpoint({ env: "PORT" })
  .withExternalHttpEndpoints()
  .withReference(placardDb)
  .waitFor(placardDb)
  // withReference injects PLACARD_URI (postgresql://…). App config falls back to it.
  .withEnvironment("BETTER_AUTH_SECRET", authSecret)
  .withEnvironment("MEDIA_DIR", "./data/media")
  .withEnvironment("PLACARD_MODULES_DIR", "./data/modules")
  .withEnvironment("WEB_DIST_DIR", "./web-dist")
  .withEnvironment("MCP_ENABLED", "true")

await builder
  .addNodeApp("worker", "../apps/server", "src/worker.ts")
  .withPnpm({ install: false })
  .withReference(placardDb)
  .waitFor(placardDb)
  .withEnvironment("BETTER_AUTH_SECRET", authSecret)
  .withEnvironment("MEDIA_DIR", "./data/media")
  .withEnvironment("PLACARD_MODULES_DIR", "./data/modules")

// Stable HTTPS URL for the SPA (geolocation / secure-context browsers). Port stays 5173.
const web = await builder
  .addViteApp("web", "../apps/web")
  .withPnpm({ install: false })
  .withHttpsEndpoint({ port: 5173, env: "PORT" })
  .withHttpsDeveloperCertificate()
  .withExternalHttpEndpoints()
  .withReference(server)
  .waitFor(server)

if (await builder.executionContext().isRunMode()) {
  // Prefer a physical LAN interface over VPN/container interfaces. Override when needed.
  const lanAddress = Object.entries(networkInterfaces())
    .filter(([name]) => /^(en\d+|eth\d+|wlan\d+|Wi-Fi|Ethernet)$/.test(name))
    .flatMap(([, addresses]) => addresses ?? [])
    .find((address) => address.family === "IPv4" && !address.internal)?.address
  const devHost = process.env.PLACARD_DEV_HOST || lanAddress || "localhost"

  // Bypass the loopback-only Aspire proxy; advertise the reachable host for auth.
  await web.withEndpointCallback("https", async (endpoint) => {
    await endpoint.isProxied.set(false)
    await endpoint.targetPort.set(5173)
    await endpoint.targetHost.set(devHost)
  })
  await web.withArgs(["--host", "0.0.0.0", "--strictPort"])
}

// The browser talks to Vite, which proxies /api; auth origin checks and invite links use it.
await server.withEnvironment("PUBLIC_URL", web.getEndpoint("https"))

await server.publishWithContainerFiles(web, "./web-dist")

await builder.build().run()
