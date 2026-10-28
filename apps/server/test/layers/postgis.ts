import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { ConfigProvider, Context, Effect, Layer } from "effect"
import { appConfig } from "../../src/config.ts"
import { withConfig } from "../../src/runtime.ts"

export const POSTGIS_IMAGE = "imresamu/postgis:18-3.6"

export class PostgisContainer extends Context.Service<
  PostgisContainer,
  { readonly container: StartedPostgreSqlContainer }
>()("test/PostgisContainer") {
  static readonly layer = Layer.effect(
    PostgisContainer,
    Effect.acquireRelease(
      Effect.promise(() => new PostgreSqlContainer(POSTGIS_IMAGE).start()),
      (container) => Effect.promise(() => container.stop()),
    ).pipe(Effect.map((container) => ({ container }))),
  )
}

export const testConfigFor = (container: StartedPostgreSqlContainer) =>
  appConfig.parse(
    ConfigProvider.fromUnknown({
      DATABASE_URL: container.getConnectionUri(),
      BETTER_AUTH_SECRET: "integration-test-secret-0123456789abcdef",
      MEDIA_DIR: "./data/test-media",
      PLACARD_MODULES_DIR: "./data/test-modules",
    }),
  )

export const IntegrationLayer = Layer.unwrap(
  Effect.gen(function* () {
    const { container } = yield* PostgisContainer
    return withConfig(yield* testConfigFor(container))
  }),
).pipe(Layer.provideMerge(PostgisContainer.layer))
