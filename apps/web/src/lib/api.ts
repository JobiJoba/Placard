import { Api } from "@placard/domain"
import { Context, Effect, Layer, ManagedRuntime } from "effect"
import { FetchHttpClient } from "effect/http"
import { HttpApiClient } from "effect/http-api"

export class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof Api>>()(
  "placard/ApiClient",
) {
  static readonly layer = Layer.effect(ApiClient, HttpApiClient.make(Api)).pipe(
    Layer.provide(FetchHttpClient.layer),
  )
}

const runtime = ManagedRuntime.make(ApiClient.layer)

/** Runs a typed API call; rejects with the endpoint's tagged error. */
export const api = <A, E>(call: (client: ApiClient["Service"]) => Effect.Effect<A, E>) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const client = yield* ApiClient
      return yield* call(client)
    }),
  )

export const isTagged = (error: unknown, tag: string): boolean =>
  typeof error === "object" && error !== null && "_tag" in error && error._tag === tag

export const errorMessage = (error: unknown): string => {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === "string" && message !== "") return message
  }
  return "Something went wrong. Please try again."
}
