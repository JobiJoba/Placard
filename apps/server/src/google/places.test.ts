import { describe, expect, it } from "@effect/vitest"
import { GoogleKeyMissing, GooglePlacesFailed } from "@placard/domain"
import { Effect, Layer, Option, Redacted, Schema } from "effect"
import { HttpClient, type HttpClientRequest } from "effect/http"
import { TestClock } from "effect/testing"
import { InstanceSettings } from "../settings/instance-settings.ts"
import { GoogleFixtureClient } from "./fixture-client.ts"
import autocompleteFixture from "./fixtures/autocomplete.json" with { type: "json" }
import placesFixture from "./fixtures/places.json" with { type: "json" }
import {
  AUTOCOMPLETE_FIELD_MASK,
  DETAILS_FIELD_MASK,
  GoogleAutocompleteResponse,
  GooglePlaceResponse,
  GooglePlaces,
  toDetails,
  toSuggestions,
} from "./places.ts"

const SESSION = "0b6a3c2e-6f4e-4a1f-9a55-6c1a1e0f2d11"

const setup = (apiKey: string | null = "test-key") => {
  const requests: Array<HttpClientRequest.HttpClientRequest> = []
  const RecordingClient = Layer.effect(
    HttpClient.HttpClient,
    Effect.map(HttpClient.HttpClient, (client) =>
      HttpClient.tapRequest(client, (request) => Effect.sync(() => requests.push(request))),
    ),
  ).pipe(Layer.provide(GoogleFixtureClient))
  const Settings = Layer.succeed(InstanceSettings, {
    googleApiKey: Effect.succeed(Option.map(Option.fromNullishOr(apiKey), Redacted.make)),
    view: Effect.die("unused"),
    setGoogleApiKey: () => Effect.die("unused"),
    clearGoogleApiKey: Effect.die("unused"),
  })
  const layer = GooglePlaces.layer.pipe(Layer.provide([RecordingClient, Settings]))
  return { requests, layer }
}

const jsonBody = (request: HttpClientRequest.HttpClientRequest) =>
  request.body._tag === "Uint8Array"
    ? JSON.parse(new TextDecoder().decode(request.body.body))
    : undefined

describe("Google response decoding", () => {
  it.effect("turns autocomplete predictions into suggestions", () =>
    Effect.gen(function* () {
      const response = yield* Schema.decodeUnknownEffect(GoogleAutocompleteResponse)(
        autocompleteFixture,
      )
      expect(toSuggestions(response)[0]).toEqual({
        googlePlaceId: "ChIJ-fixture-da-michele",
        primaryText: "L'Antica Pizzeria da Michele",
        secondaryText: "Via Cesare Sersale, Naples, Metropolitan City of Naples, Italy",
      })
    }),
  )

  it.effect("skips query predictions and tolerates an empty response", () =>
    Effect.gen(function* () {
      const response = yield* Schema.decodeUnknownEffect(GoogleAutocompleteResponse)({
        suggestions: [{ queryPrediction: { text: { text: "pizza near me" } } }],
      })
      expect(toSuggestions(response)).toEqual([])
      expect(
        toSuggestions(yield* Schema.decodeUnknownEffect(GoogleAutocompleteResponse)({})),
      ).toEqual([])
    }),
  )

  it.effect("turns a place into the fields Placard stores", () =>
    Effect.gen(function* () {
      const place = yield* Schema.decodeUnknownEffect(GooglePlaceResponse)(
        placesFixture["ChIJ-fixture-tiergarten"],
      )
      expect(toDetails(place)).toEqual({
        googlePlaceId: "ChIJ-fixture-tiergarten",
        name: "Großer Tiergarten",
        address: "Straße des 17. Juni 100, 10557 Berlin, Germany",
        location: { lat: 52.5144951, lng: 13.3500893 },
        category: "park",
        utcOffsetMinutes: 60,
      })
    }),
  )

  it.effect("rejects a place without a location", () =>
    Effect.gen(function* () {
      const result = yield* Schema.decodeUnknownEffect(GooglePlaceResponse)({
        id: "x",
        displayName: { text: "Nowhere" },
      }).pipe(Effect.result)
      expect(result._tag).toBe("Failure")
    }),
  )
})

describe("GooglePlaces", () => {
  it.effect("calls Autocomplete with the key, field mask, session token and bias", () => {
    const { requests, layer } = setup()
    return Effect.gen(function* () {
      const google = yield* GooglePlaces
      const suggestions = yield* google.autocomplete({
        input: "michele",
        sessionToken: SESSION,
        near: { lat: 40.85, lng: 14.27 },
      })

      expect(suggestions.map((s) => s.googlePlaceId)).toEqual(["ChIJ-fixture-da-michele"])
      const [request] = requests
      expect(request?.method).toBe("POST")
      expect(request?.url).toBe("https://places.googleapis.com/v1/places:autocomplete")
      expect(request?.headers["x-goog-api-key"]).toBe("test-key")
      expect(request?.headers["x-goog-fieldmask"]).toBe(AUTOCOMPLETE_FIELD_MASK)
      expect(request && jsonBody(request)).toEqual({
        input: "michele",
        sessionToken: SESSION,
        locationBias: {
          circle: { center: { latitude: 40.85, longitude: 14.27 }, radius: 50_000 },
        },
      })
    }).pipe(Effect.provide(layer))
  })

  it.effect("leaves out the location bias when there is no position", () => {
    const { requests, layer } = setup()
    return Effect.gen(function* () {
      const google = yield* GooglePlaces
      yield* google.autocomplete({ input: "café", sessionToken: SESSION, near: null })
      const [request] = requests
      expect(request && jsonBody(request)).toEqual({ input: "café", sessionToken: SESSION })
    }).pipe(Effect.provide(layer))
  })

  it.effect("calls Place Details with the field mask and session token", () => {
    const { requests, layer } = setup()
    return Effect.gen(function* () {
      const google = yield* GooglePlaces
      const details = yield* google.details("ChIJ-fixture-da-michele", SESSION)

      expect(details).toMatchObject({
        name: "L'Antica Pizzeria da Michele",
        category: "restaurant",
      })
      const [request] = requests
      expect(request?.method).toBe("GET")
      expect(request?.url).toBe("https://places.googleapis.com/v1/places/ChIJ-fixture-da-michele")
      expect(request?.urlParams.params).toEqual([["sessionToken", SESSION]])
      expect(request?.headers["x-goog-fieldmask"]).toBe(DETAILS_FIELD_MASK)
    }).pipe(Effect.provide(layer))
  })

  it.effect("serves repeat Details calls from the cache until it expires", () => {
    const { requests, layer } = setup()
    return Effect.gen(function* () {
      const google = yield* GooglePlaces
      yield* google.details("ChIJ-fixture-cafe-sperl", SESSION)
      yield* google.details("ChIJ-fixture-cafe-sperl", null)
      expect(requests).toHaveLength(1)

      yield* TestClock.adjust("11 minutes")
      yield* google.details("ChIJ-fixture-cafe-sperl", null)
      expect(requests).toHaveLength(2)
    }).pipe(Effect.provide(layer))
  })

  it.effect("reports Google's own error message", () => {
    const { layer } = setup()
    return Effect.gen(function* () {
      const google = yield* GooglePlaces
      const error = yield* google.details("ChIJ-unknown", null).pipe(Effect.flip)
      expect(error).toEqual(
        new GooglePlacesFailed({ message: "Google Places: Requested entity was not found." }),
      )
    }).pipe(Effect.provide(layer))
  })

  it.effect("reports a rejected key", () => {
    const { layer } = setup("invalid-key")
    return Effect.gen(function* () {
      const google = yield* GooglePlaces
      const error = yield* google
        .autocomplete({ input: "michele", sessionToken: SESSION, near: null })
        .pipe(Effect.flip)
      expect(error.message).toBe("Google Places: API key not valid. Please pass a valid API key.")
    }).pipe(Effect.provide(layer))
  })

  it.effect("fails without calling Google when no key is set", () => {
    const { requests, layer } = setup(null)
    return Effect.gen(function* () {
      const google = yield* GooglePlaces
      const error = yield* google.details("ChIJ-fixture-cafe-sperl", null).pipe(Effect.flip)
      expect(error).toBeInstanceOf(GoogleKeyMissing)
      expect(requests).toHaveLength(0)
    }).pipe(Effect.provide(layer))
  })
})
