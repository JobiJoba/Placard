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
    readonly setModuleUpdateCheckHours: (hours: number) => Effect.Effect<InstanceSettingsView>
    readonly moduleUpdateCheckHours: Effect.Effect<number>
    readonly householdEnabled: Effect.Effect<boolean>
    readonly setHouseholdEnabled: (enabled: boolean) => Effect.Effect<InstanceSettingsView>
  }
>()("placard/InstanceSettings") {
  static readonly layer = Layer.effect(
    InstanceSettings,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const config = yield* AppConfig
      const verifier = yield* GoogleKeyVerifier

      const settingsRow = sql<{
        google_api_key: string | null
        household_enabled: boolean
        module_update_check_hours: number
      }>`
        select google_api_key, household_enabled, module_update_check_hours
        from instance_settings where id = 1`.pipe(
        Effect.map(
          (rows) =>
            rows[0] ?? {
              google_api_key: null,
              household_enabled: false,
              module_update_check_hours: 24,
            },
        ),
        Effect.orDie,
      )

      const view: Effect.Effect<InstanceSettingsView> = settingsRow.pipe(
        Effect.map((row) => {
          const stored = Option.fromNullishOr(row.google_api_key)
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
            householdEnabled: row.household_enabled,
            moduleUpdateCheckHours: row.module_update_check_hours,
          }
        }),
      )

      const writeKey = (apiKey: string | null) =>
        sql`
          update instance_settings set google_api_key = ${apiKey}, updated_at = now()
          where id = 1`.pipe(Effect.orDie)

      return {
        view,
        googleApiKey: settingsRow.pipe(
          Effect.map((row) =>
            row.google_api_key != null
              ? Option.some(Redacted.make(row.google_api_key))
              : config.googleMapsApiKey,
          ),
        ),
        setGoogleApiKey: Effect.fn("InstanceSettings.setGoogleApiKey")(function* (apiKey) {
          yield* verifier.verify(Redacted.make(apiKey))
          yield* writeKey(apiKey)
          return yield* view
        }),
        clearGoogleApiKey: writeKey(null).pipe(Effect.andThen(view)),
        setModuleUpdateCheckHours: Effect.fn("InstanceSettings.setModuleUpdateCheckHours")(
          function* (hours) {
            yield* sql`
              update instance_settings
              set module_update_check_hours = ${hours}, updated_at = now()
              where id = 1`.pipe(Effect.orDie)
            return yield* view
          },
        ),
        moduleUpdateCheckHours: settingsRow.pipe(
          Effect.map((row) => row.module_update_check_hours),
        ),
        householdEnabled: settingsRow.pipe(Effect.map((row) => row.household_enabled)),
        setHouseholdEnabled: Effect.fn("InstanceSettings.setHouseholdEnabled")(function* (
          enabled,
        ) {
          yield* sql`
            update instance_settings
            set household_enabled = ${enabled}, updated_at = now()
            where id = 1`.pipe(Effect.orDie)
          return yield* view
        }),
      }
    }),
  )
}
