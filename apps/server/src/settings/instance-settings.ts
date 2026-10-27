import type { GoogleKeyRejected, InstanceSettingsView } from "@placard/domain"
import { Context, Effect, Layer, Option, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { AppConfig } from "../config.ts"
import { GoogleKeyVerifier } from "./google-key.ts"

export class InstanceSettings extends Context.Service<
  InstanceSettings,
  {
    readonly view: Effect.Effect<InstanceSettingsView>
    /** The instance key if set, otherwise `GOOGLE_MAPS_API_KEY`. */
    readonly googleApiKey: Effect.Effect<Option.Option<Redacted.Redacted<string>>>
    readonly setGoogleApiKey: (
      apiKey: string,
    ) => Effect.Effect<InstanceSettingsView, GoogleKeyRejected>
    readonly clearGoogleApiKey: Effect.Effect<InstanceSettingsView>
  }
>()("placard/InstanceSettings") {
  static readonly layer = Layer.effect(
    InstanceSettings,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const config = yield* AppConfig
      const verifier = yield* GoogleKeyVerifier

      const storedKey = sql<{ google_api_key: string | null }>`
        select google_api_key from instance_settings where id = 1`.pipe(
        Effect.map((rows) => Option.fromNullishOr(rows[0]?.google_api_key)),
        Effect.orDie,
      )

      const view: Effect.Effect<InstanceSettingsView> = storedKey.pipe(
        Effect.map((stored) => {
          const [source, key] = Option.isSome(stored)
            ? (["instance", Option.some(stored.value)] as const)
            : Option.isSome(config.googleMapsApiKey)
              ? (["env", Option.some(Redacted.value(config.googleMapsApiKey.value))] as const)
              : (["none", Option.none<string>()] as const)
          return {
            googleApiKey: {
              source,
              last4: Option.getOrNull(Option.map(key, (k) => k.slice(-4))),
            },
          }
        }),
      )

      const writeKey = (apiKey: string | null) =>
        sql`
          update instance_settings set google_api_key = ${apiKey}, updated_at = now()
          where id = 1`.pipe(Effect.orDie)

      return {
        view,
        googleApiKey: storedKey.pipe(
          Effect.map((stored) =>
            Option.isSome(stored)
              ? Option.some(Redacted.make(stored.value))
              : config.googleMapsApiKey,
          ),
        ),
        setGoogleApiKey: Effect.fn("InstanceSettings.setGoogleApiKey")(function* (apiKey) {
          yield* verifier.verify(Redacted.make(apiKey))
          yield* writeKey(apiKey)
          return yield* view
        }),
        clearGoogleApiKey: writeKey(null).pipe(Effect.andThen(view)),
      }
    }),
  )
}
