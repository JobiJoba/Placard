// Aspire TypeScript AppHost for Placard.
// Local orchestration + Docker Compose publish. Self-hosters use the committed compose.yaml.

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
  .withEnvironment("WEB_DIST_DIR", "./web-dist")
  .withEnvironment("MCP_ENABLED", "true")

await builder
  .addNodeApp("worker", "../apps/server", "src/worker.ts")
  .withPnpm({ install: false })
  .withReference(placardDb)
  .waitFor(placardDb)
  .withEnvironment("BETTER_AUTH_SECRET", authSecret)
  .withEnvironment("MEDIA_DIR", "./data/media")

// Stable HTTPS URL for the SPA (geolocation / secure-context browsers). Port stays 5173.
const web = await builder
  .addViteApp("web", "../apps/web")
  .withPnpm({ install: false })
  .withHttpsEndpoint({ port: 5173, env: "PORT" })
  .withHttpsDeveloperCertificate()
  .withExternalHttpEndpoints()
  .withReference(server)
  .waitFor(server)

// The browser talks to Vite, which proxies /api; auth origin checks and invite links use it.
await server.withEnvironment("PUBLIC_URL", web.getEndpoint("https"))

await server.publishWithContainerFiles(web, "./web-dist")

await builder.build().run()
