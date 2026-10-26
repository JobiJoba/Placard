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
  .withEnvironment("PUBLIC_URL", "http://localhost:3000")
  .withEnvironment("MEDIA_DIR", "./data/media")
  .withEnvironment("WEB_DIST_DIR", "./web-dist")
  .withEnvironment("MCP_ENABLED", "true")

await builder
  .addNodeApp("worker", "../apps/server", "src/worker.ts")
  .withPnpm({ install: false })
  .withReference(placardDb)
  .waitFor(placardDb)
  .withEnvironment("MEDIA_DIR", "./data/media")

const web = await builder
  .addViteApp("web", "../apps/web")
  .withPnpm({ install: false })
  .withReference(server)
  .waitFor(server)

await server.publishWithContainerFiles(web, "./web-dist")

await builder.build().run()
