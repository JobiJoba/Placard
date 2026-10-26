import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Option, Redacted } from "effect"
import { appConfig, formatConfigError } from "./config.ts"

const parse = (env: Record<string, string>) => appConfig.parse(ConfigProvider.fromUnknown(env))

const DATABASE_URL = "postgres://placard:secret@localhost:5432/placard"

describe("appConfig", () => {
  it.effect("applies defaults when only DATABASE_URL is set", () =>
    Effect.gen(function* () {
      const config = yield* parse({ DATABASE_URL })

      expect(Redacted.value(config.databaseUrl)).toBe(DATABASE_URL)
      expect(config.publicUrl.href).toBe("http://localhost:3000/")
      expect(config.mediaDir).toBe("./data/media")
      expect(config.webDistDir).toBe("./web-dist")
      expect(config.port).toBe(3000)
      expect(Option.isNone(config.googleMapsApiKey)).toBe(true)
      expect(config.mcpEnabled).toBe(true)
    }),
  )

  it.effect("reads every variable when provided", () =>
    Effect.gen(function* () {
      const config = yield* parse({
        DATABASE_URL,
        PUBLIC_URL: "https://places.example.com",
        MEDIA_DIR: "/data/media",
        GOOGLE_MAPS_API_KEY: "  key-123  ",
        MCP_ENABLED: "false",
      })

      expect(config.publicUrl.hostname).toBe("places.example.com")
      expect(config.mediaDir).toBe("/data/media")
      expect(config.googleMapsApiKey.pipe(Option.map(Redacted.value))).toEqual(
        Option.some("key-123"),
      )
      expect(config.mcpEnabled).toBe(false)
    }),
  )

  it.effect("treats an empty Google key as absent", () =>
    Effect.gen(function* () {
      const config = yield* parse({ DATABASE_URL, GOOGLE_MAPS_API_KEY: "   " })
      expect(Option.isNone(config.googleMapsApiKey)).toBe(true)
    }),
  )

  it.effect("never exposes secrets when printed", () =>
    Effect.gen(function* () {
      const config = yield* parse({ DATABASE_URL, GOOGLE_MAPS_API_KEY: "key-123" })
      const printed = `${String(config.databaseUrl)} ${JSON.stringify(config)}`
      expect(printed).not.toContain("secret")
      expect(printed).not.toContain("key-123")
    }),
  )

  it.effect.each([
    ["DATABASE_URL is missing", {}],
    ["DATABASE_URL is empty", { DATABASE_URL: "" }],
    ["PUBLIC_URL is not a URL", { DATABASE_URL, PUBLIC_URL: "not a url" }],
    ["MCP_ENABLED is not a boolean", { DATABASE_URL, MCP_ENABLED: "maybe" }],
  ] as const)("fails when %s", ([, env]) =>
    Effect.gen(function* () {
      const result = yield* parse(env).pipe(Effect.flip)
      expect(formatConfigError(result)).toContain("Placard cannot start")
    }),
  )

  it.effect("names the missing variable in the error message", () =>
    Effect.gen(function* () {
      const error = yield* parse({}).pipe(Effect.flip)
      expect(formatConfigError(error)).toMatch(/DATABASE_URL|PLACARD_URI/)
    }),
  )

  it.effect("accepts Aspire PLACARD_URI when DATABASE_URL is absent", () =>
    Effect.gen(function* () {
      const config = yield* parse({ PLACARD_URI: DATABASE_URL })
      expect(Redacted.value(config.databaseUrl)).toBe(DATABASE_URL)
    }),
  )
})
