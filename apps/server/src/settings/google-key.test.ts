import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Redacted } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { GoogleKeyVerifier } from "./google-key.ts"

const verifyWith = (respond: (headers: Record<string, string>) => Response) => {
  const seen: Array<Record<string, string>> = []
  const client = HttpClient.make((request) => {
    seen.push({ ...request.headers, url: request.url })
    return Effect.succeed(HttpClientResponse.fromWeb(request, respond(request.headers)))
  })
  const layer = GoogleKeyVerifier.layer.pipe(
    Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
  )
  const verify = Effect.gen(function* () {
    const verifier = yield* GoogleKeyVerifier
    return yield* verifier.verify(Redacted.make("AIza-test"))
  }).pipe(Effect.provide(layer))
  return { verify, seen }
}

describe("GoogleKeyVerifier", () => {
  it.effect("accepts a key when the Places test call succeeds", () =>
    Effect.gen(function* () {
      const { verify, seen } = verifyWith(() => Response.json({ places: [] }))
      yield* verify
      expect(seen[0]).toMatchObject({
        url: "https://places.googleapis.com/v1/places:searchText",
        "x-goog-api-key": "AIza-test",
        "x-goog-fieldmask": "places.id",
      })
    }),
  )

  it.effect("surfaces Google's own error message", () =>
    Effect.gen(function* () {
      const { verify } = verifyWith(() =>
        Response.json(
          { error: { code: 400, message: "API key not valid. Please pass a valid API key." } },
          { status: 400 },
        ),
      )
      const error = yield* Effect.flip(verify)
      expect(error._tag).toBe("GoogleKeyRejected")
      expect(error.message).toBe(
        "Google rejected the key: API key not valid. Please pass a valid API key.",
      )
    }),
  )

  it.effect("falls back to the HTTP status for unexpected bodies", () =>
    Effect.gen(function* () {
      const { verify } = verifyWith(() => new Response("nope", { status: 403 }))
      const error = yield* Effect.flip(verify)
      expect(error.message).toBe("Google rejected the key: HTTP 403")
    }),
  )

  it.effect("reports network failures as unreachable", () =>
    Effect.gen(function* () {
      const client = HttpClient.make((request) =>
        Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({ request, description: "ECONNREFUSED" }),
          }),
        ),
      )
      const error = yield* Effect.gen(function* () {
        const verifier = yield* GoogleKeyVerifier
        return yield* verifier.verify(Redacted.make("AIza-test"))
      }).pipe(
        Effect.provide(
          GoogleKeyVerifier.layer.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client))),
        ),
        Effect.flip,
      )
      expect(error.message).toMatch(/^Could not reach Google: /)
    }),
  )
})
