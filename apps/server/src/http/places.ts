import { Api, CurrentUser } from "@placard/domain"
import { Effect, Option, Redacted } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { GooglePlaces } from "../google/places.ts"
import { Lists } from "../places/lists.ts"
import { Places } from "../places/places.ts"
import { Tags } from "../places/tags.ts"
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
      .handle("list", ({ query }) => withMe((me) => places.list(me.id, query)))
      .handle("deleted", () => withMe((me) => places.listDeleted(me.id)))
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
      .handle("update", ({ params, payload }) =>
        withMe((me) => places.update(me.id, params.id, payload)),
      )
      .handle("setTags", ({ params, payload }) =>
        withMe((me) => places.setTags(me.id, params.id, payload.names)),
      )
      .handle("setLists", ({ params, payload }) =>
        withMe((me) => places.setLists(me.id, params.id, payload.listIds)),
      )
      .handle("remove", ({ params }) => withMe((me) => places.remove(me.id, params.id)))
      .handle("bulk", ({ payload }) =>
        withMe((me) => places.bulk(me.id, payload.placeIds, payload.action)),
      )
      .handle("restore", ({ payload }) => withMe((me) => places.restore(me.id, payload.placeIds)))
  }),
)

export const TagsApiLive = HttpApiBuilder.group(
  Api,
  "tags",
  Effect.fn(function* (handlers) {
    const tags = yield* Tags
    return handlers
      .handle("list", () => withMe((me) => tags.list(me.id)))
      .handle("create", ({ payload }) => withMe((me) => tags.create(me.id, payload.name)))
      .handle("rename", ({ params, payload }) =>
        withMe((me) => tags.rename(me.id, params.id, payload.name)),
      )
      .handle("remove", ({ params }) => withMe((me) => tags.remove(me.id, params.id)))
  }),
)

export const ListsApiLive = HttpApiBuilder.group(
  Api,
  "lists",
  Effect.fn(function* (handlers) {
    const lists = yield* Lists
    return handlers
      .handle("list", () => withMe((me) => lists.list(me.id)))
      .handle("create", ({ payload }) => withMe((me) => lists.create(me.id, payload)))
      .handle("get", ({ params }) => withMe((me) => lists.get(me.id, params.id)))
      .handle("update", ({ params, payload }) =>
        withMe((me) => lists.update(me.id, params.id, payload)),
      )
      .handle("remove", ({ params }) => withMe((me) => lists.remove(me.id, params.id)))
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
