import { access } from "node:fs/promises"
import { createServer } from "node:http"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter, HttpStaticServer } from "effect/http"
import { AppConfig, loadConfigOrExit } from "./config.ts"
import { runMigrations } from "./db/migrate.ts"
import { GoogleFixtureClient } from "./google/fixture-client.ts"
import { RoutesLive } from "./http/api.ts"
import { ModuleRuntime } from "./modules/loader.ts"
import { Modules } from "./modules/modules.ts"
import { ObservabilityLive } from "./observability.ts"
import { withConfig } from "./runtime.ts"

const directoryExists = (path: string) =>
  Effect.tryPromise({
    try: () => access(path).then(() => true),
    catch: () => false,
  }).pipe(Effect.orElseSucceed(() => false))

const StaticLive = Layer.unwrap(
  Effect.gen(function* () {
    const { webDistDir } = yield* AppConfig
    if (!(yield* directoryExists(webDistDir))) {
      yield* Effect.logWarning(`WEB_DIST_DIR ${webDistDir} not found; SPA static serving disabled`)
      return Layer.empty
    }
    return HttpStaticServer.layer({
      root: webDistDir,
      spa: true,
      index: "index.html",
    })
  }),
)

const program = Effect.gen(function* () {
  const config = yield* loadConfigOrExit
  yield* Effect.log(`Starting Placard on port ${config.port}`)
  yield* runMigrations.pipe(Effect.provide(withConfig(config)))

  const http = config.fakeGoogle ? GoogleFixtureClient : FetchHttpClient.layer
  yield* Effect.gen(function* () {
    const modules = yield* Modules
    yield* modules.loadDiskModules
  }).pipe(
    Effect.provide(
      Modules.layer.pipe(Layer.provide(ModuleRuntime.layer), Layer.provide(http)),
    ),
    Effect.provide(withConfig(config)),
    Effect.catchCause((cause) =>
      Effect.logWarning("Could not load disk modules", { cause: String(cause) }),
    ),
  )

  const ServerLive = HttpRouter.serve(Layer.mergeAll(RoutesLive, StaticLive)).pipe(
    Layer.provide(http),
    Layer.provide(NodeHttpServer.layer(createServer, { port: config.port })),
    Layer.provide(withConfig(config)),
    Layer.provideMerge(ObservabilityLive),
  )

  yield* Layer.launch(ServerLive)
})

NodeRuntime.runMain(program)
