import { GoogleKeyRejected } from "@placard/domain"
import { Context, Effect, Layer, Redacted, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"

const GoogleErrorBody = Schema.Struct({
  error: Schema.Struct({ message: Schema.String }),
})

/**
 * Proves a key works with a Places "Text Search (IDs only)" call, which Google
 * does not bill.
 */
export class GoogleKeyVerifier extends Context.Service<
  GoogleKeyVerifier,
  { readonly verify: (apiKey: Redacted.Redacted<string>) => Effect.Effect<void, GoogleKeyRejected> }
>()("placard/GoogleKeyVerifier") {
  static readonly layer = Layer.effect(
    GoogleKeyVerifier,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient

      return {
        verify: Effect.fn("GoogleKeyVerifier.verify")(function* (apiKey) {
          const request = HttpClientRequest.post(
            "https://places.googleapis.com/v1/places:searchText",
          ).pipe(
            HttpClientRequest.setHeaders({
              "X-Goog-Api-Key": Redacted.value(apiKey),
              "X-Goog-FieldMask": "places.id",
            }),
            HttpClientRequest.bodyJsonUnsafe({ textQuery: "Eiffel Tower", pageSize: 1 }),
          )
          const response = yield* client.execute(request).pipe(
            Effect.timeout("10 seconds"),
            Effect.mapError(
              (error) =>
                new GoogleKeyRejected({ message: `Could not reach Google: ${error.message}` }),
            ),
          )
          if (response.status >= 200 && response.status < 300) return
          const detail = yield* response.json.pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(GoogleErrorBody)),
            Effect.map((body) => body.error.message),
            Effect.orElseSucceed(() => `HTTP ${response.status}`),
          )
          return yield* new GoogleKeyRejected({ message: `Google rejected the key: ${detail}` })
        }),
      }
    }),
  )

  /** Accepts any key except ones containing "invalid"; for tests. */
  static readonly fake = Layer.succeed(GoogleKeyVerifier, {
    verify: (apiKey) =>
      Redacted.value(apiKey).includes("invalid")
        ? Effect.fail(
            new GoogleKeyRejected({ message: "Google rejected the key: API key not valid." }),
          )
        : Effect.void,
  })
}
