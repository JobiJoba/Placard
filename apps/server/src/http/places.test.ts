import { expect, layer } from "@effect/vitest"
import { AdminAuthentication, Api, Authentication, CurrentUser, type Place } from "@placard/domain"
import { DateTime, Effect, Layer, Option } from "effect"
import { HttpServer } from "effect/http"
import { HttpApiTest } from "effect/http-api"
import { GooglePlaces } from "../google/places.ts"
import { Enrichment } from "../places/enrichment.ts"
import { Places } from "../places/places.ts"
import { InstanceSettings } from "../settings/instance-settings.ts"
import { GoogleApiLive, PlacesApiLive } from "./places.ts"

const emptyFacts = {
  openingHours: null,
  phone: null,
  website: null,
  priceLevel: null,
  rating: null,
  cuisine: null,
  types: null,
  fromGoogle: false,
}

const saved: Place = {
  id: "0199a1b2-0000-7000-8000-000000000001",
  name: "L'Antica Pizzeria da Michele",
  category: "restaurant",
  location: { lat: 40.8497877, lng: 14.2633047 },
  address: "Via Cesare Sersale, 1, 80139 Napoli NA, Italy",
  googlePlaceId: "ChIJ-fixture-da-michele",
  status: null,
  notes: null,
  source: "autocomplete",
  editedFields: [],
  tags: [],
  listIds: [],
  facts: emptyFacts,
  customFields: [],
  coverMediaId: null,
  coverThumbUrl: null,
  createdAt: DateTime.makeUnsafe(0),
}

const googleCalls: Array<string> = []
const inserts: Array<string> = []

const unused = () => Effect.die("not under test")

const OneSavedPlace = Layer.succeed(
  Places,
  Places.of({
    list: () => Effect.succeed([saved]),
    get: () => Effect.succeed(saved),
    findByGooglePlaceId: (_, googlePlaceId) =>
      Effect.succeed(googlePlaceId === saved.googlePlaceId ? Option.some(saved) : Option.none()),
    addFromGoogle: (_, details) =>
      Effect.sync(() => {
        inserts.push(details.googlePlaceId)
        return {
          place: { ...saved, id: "new", googlePlaceId: details.googlePlaceId },
          created: true,
        }
      }),
    addFromTakeout: unused,
    addManual: unused,
    update: unused,
    setTags: unused,
    setLists: unused,
    remove: unused,
    bulk: unused,
    listDeleted: () => Effect.succeed([]),
    restore: unused,
    addCustomField: unused,
    updateCustomField: unused,
    removeCustomField: unused,
    listExpiredDeleted: Effect.succeed([]),
    purgeExpired: Effect.succeed(0),
  }),
)

const RecordingGoogle = Layer.succeed(
  GooglePlaces,
  GooglePlaces.of({
    autocomplete: () => Effect.die("not under test"),
    searchText: () => Effect.succeed([]),
    photoBytes: () => Effect.die("not under test"),
    details: (googlePlaceId) =>
      Effect.sync(() => {
        googleCalls.push(googlePlaceId)
        return {
          googlePlaceId,
          name: "Café Sperl",
          address: null,
          location: { lat: 48.2, lng: 16.36 },
          category: "cafe" as const,
          utcOffsetMinutes: null,
          photoName: null,
          enrichment: {},
        }
      }),
  }),
)

const SignedIn = Layer.mergeAll(
  Layer.succeed(
    Authentication,
    Authentication.of((httpEffect) =>
      Effect.provideService(httpEffect, CurrentUser, {
        id: "user-1",
        name: "Ada",
        email: "ada@example.com",
        role: "member",
        distanceUnit: "km",
      }),
    ),
  ),
  Layer.succeed(
    AdminAuthentication,
    AdminAuthentication.of(() => Effect.die("not under test")),
  ),
  HttpServer.layerServices,
)

const Settings = Layer.succeed(InstanceSettings, {
  googleApiKey: Effect.succeed(Option.none()),
  view: Effect.die("not under test"),
  setGoogleApiKey: () => Effect.die("not under test"),
  clearGoogleApiKey: Effect.die("not under test"),
})

const StubEnrichment = Layer.succeed(
  Enrichment,
  Enrichment.of({
    applyDetails: () => Effect.void,
    enrichPlace: unused,
    setOverride: unused,
    clearOverride: unused,
    planRefreshAll: () => Effect.succeed({ placeCount: 0 }),
    startRefreshAll: unused,
    currentRun: () => Effect.succeed(null),
    markJobDone: () => Effect.void,
  }),
)

const makeClient = HttpApiTest.groups(Api, ["places", "google"])

layer(
  Layer.mergeAll(PlacesApiLive, GoogleApiLive).pipe(
    Layer.provide([OneSavedPlace, RecordingGoogle, Settings, StubEnrichment]),
    Layer.provideMerge(SignedIn),
  ),
)("duplicate detection", (it) => {
  it.effect("returns the existing place without calling Google or inserting", () =>
    Effect.gen(function* () {
      googleCalls.length = 0
      inserts.length = 0
      const client = yield* makeClient
      const result = yield* client.places.addFromGoogle({
        payload: {
          googlePlaceId: "ChIJ-fixture-da-michele",
          source: "autocomplete",
          sessionToken: null,
        },
      })
      expect(result).toEqual({ place: saved, created: false })
      expect(googleCalls).toEqual([])
      expect(inserts).toEqual([])
    }),
  )

  it.effect("fetches details and inserts a place the user does not have yet", () =>
    Effect.gen(function* () {
      googleCalls.length = 0
      inserts.length = 0
      const client = yield* makeClient
      const result = yield* client.places.addFromGoogle({
        payload: {
          googlePlaceId: "ChIJ-fixture-cafe-sperl",
          source: "map_pick",
          sessionToken: null,
        },
      })
      expect(result.created).toBe(true)
      expect(googleCalls).toEqual(["ChIJ-fixture-cafe-sperl"])
      expect(inserts).toEqual(["ChIJ-fixture-cafe-sperl"])
    }),
  )

  it.effect("marks a preview of a saved place with its library id", () =>
    Effect.gen(function* () {
      const client = yield* makeClient
      const known = yield* client.google.preview({
        params: { googlePlaceId: "ChIJ-fixture-da-michele" },
        query: {},
      })
      const fresh = yield* client.google.preview({
        params: { googlePlaceId: "ChIJ-fixture-cafe-sperl" },
        query: {},
      })
      expect(known.existingPlaceId).toBe(saved.id)
      expect(fresh.existingPlaceId).toBeNull()
    }),
  )
})
