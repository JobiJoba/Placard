import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect"

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

const authSecretConfig = Config.schema(
  Schema.Trim.pipe(
    Schema.check(Schema.isMinLength(32, { message: "must be at least 32 characters" })),
  ),
  "BETTER_AUTH_SECRET",
).pipe(Config.map(Redacted.make))

export const appConfig = Config.all({
  databaseUrl: databaseUrlConfig,
  authSecret: authSecretConfig,
  publicUrl: Config.URL("PUBLIC_URL").pipe(Config.withDefault(new URL("http://localhost:3000"))),
  mediaDir: Config.NonEmptyString("MEDIA_DIR").pipe(Config.withDefault("./data/media")),
  /** Trusted prebuilt plugins (upload/folder) extracted here; survives Docker restarts. */
  modulesDir: Config.NonEmptyString("PLACARD_MODULES_DIR").pipe(
    Config.withDefault("./data/modules"),
  ),
  webDistDir: Config.NonEmptyString("WEB_DIST_DIR").pipe(Config.withDefault("./web-dist")),
  port: Config.Number("PORT").pipe(Config.withDefault(3000)),
  googleMapsApiKey: optionalSecret("GOOGLE_MAPS_API_KEY"),
  mcpEnabled: Config.Boolean("MCP_ENABLED").pipe(Config.withDefault(true)),
  /** Test-only: answer every Google call from bundled fixtures. */
  fakeGoogle: Config.Boolean("PLACARD_FAKE_GOOGLE").pipe(Config.withDefault(false)),
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
