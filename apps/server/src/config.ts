import { Config, Context, Effect, Layer, Option, Redacted } from "effect"

const optionalSecret = (name: string) =>
  Config.String(name).pipe(
    Config.withDefault(""),
    Config.map((value) => {
      const trimmed = value.trim()
      return trimmed === "" ? Option.none() : Option.some(Redacted.make(trimmed))
    }),
  )

/** Prefer DATABASE_URL; under Aspire, withReference injects PLACARD_URI (postgresql://…). */
const databaseUrlConfig = Config.NonEmptyString("DATABASE_URL").pipe(
  Config.orElse(() => Config.NonEmptyString("PLACARD_URI")),
  Config.map(Redacted.make),
)

export const appConfig = Config.all({
  databaseUrl: databaseUrlConfig,
  publicUrl: Config.URL("PUBLIC_URL").pipe(Config.withDefault(new URL("http://localhost:3000"))),
  mediaDir: Config.NonEmptyString("MEDIA_DIR").pipe(Config.withDefault("./data/media")),
  webDistDir: Config.NonEmptyString("WEB_DIST_DIR").pipe(Config.withDefault("./web-dist")),
  port: Config.Number("PORT").pipe(Config.withDefault(3000)),
  googleMapsApiKey: optionalSecret("GOOGLE_MAPS_API_KEY"),
  mcpEnabled: Config.Boolean("MCP_ENABLED").pipe(Config.withDefault(true)),
})

export type AppConfigShape = Config.Success<typeof appConfig>

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()("placard/AppConfig") {
  static readonly layer = Layer.effect(AppConfig, appConfig)
}

export const formatConfigError = (error: Config.ConfigError): string =>
  `Placard cannot start: invalid configuration.\n${String(error)}\nSee .env.example for the expected variables.`

export const loadConfigOrExit: Effect.Effect<AppConfigShape> = appConfig.pipe(
  Effect.catch((error) =>
    Effect.sync(() => {
      console.error(formatConfigError(error))
      process.exit(1)
    }),
  ),
)
