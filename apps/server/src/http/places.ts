import { Api, CurrentUser } from "@placard/domain"
import { Effect, Option, Redacted } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { GooglePlaces } from "../google/places.ts"
import { Places } from "../places/places.ts"
import { InstanceSettings } from "../settings/instance-settings.ts"

const withMe = <A, E, R>(f: (me: CurrentUser["Service"]) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    return yield* f(yield* CurrentUser)
  })

export const PlacesApiLive = HttpApiBuilder.group(
  Api,
  "places",
  Effect.fn(function* (handlers) {
    const places = yield* Places
    const google = yield* GooglePlaces
    return handlers
      .handle("list", () => withMe((me) => places.list(me.id)))
      .handle("get", ({ params }) => withMe((me) => places.get(me.id, params.id)))
      .handle("addFromGoogle", ({ payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          const existing = yield* places.findByGooglePlaceId(me.id, payload.googlePlaceId)
          if (Option.isSome(existing)) return { place: existing.value, created: false }
          const details = yield* google.details(payload.googlePlaceId, payload.sessionToken)
          return yield* places.addFromGoogle(me.id, details, payload.source)
        }),
      )
      .handle("addManual", ({ payload }) => withMe((me) => places.addManual(me.id, payload)))
      .handle("remove", ({ params }) => withMe((me) => places.remove(me.id, params.id)))
  }),
)

export const GoogleApiLive = HttpApiBuilder.group(
  Api,
  "google",
  Effect.fn(function* (handlers) {
    const places = yield* Places
    const google = yield* GooglePlaces
    const settings = yield* InstanceSettings
    return handlers
      .handle("config", () =>
        settings.googleApiKey.pipe(
          Effect.map((key) => ({
            mapsApiKey: Option.getOrNull(Option.map(key, Redacted.value)),
          })),
        ),
      )
      .handle("autocomplete", ({ payload }) => google.autocomplete(payload))
      .handle("preview", ({ params, query }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          const details = yield* google.details(params.googlePlaceId, query.sessionToken ?? null)
          const existing = yield* places.findByGooglePlaceId(me.id, details.googlePlaceId)
          return {
            googlePlaceId: details.googlePlaceId,
            name: details.name,
            address: details.address,
            location: details.location,
            category: details.category,
            existingPlaceId: Option.getOrNull(Option.map(existing, (place) => place.id)),
          }
        }),
      )
  }),
)
