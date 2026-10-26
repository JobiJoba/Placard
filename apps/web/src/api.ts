import { Api } from "@placard/domain"
import { Context, Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"
import { HttpApiClient } from "effect/http-api"

export class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof Api>>()(
  "placard/ApiClient",
) {
  static readonly layer = Layer.effect(
    ApiClient,
    HttpApiClient.make(Api, {
      transformClient: (client) =>
        client.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(""))),
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer))
}

export const fetchHealth = Effect.gen(function* () {
  const client = yield* ApiClient
  return yield* client.health()
}).pipe(Effect.provide(ApiClient.layer))
