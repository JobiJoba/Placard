import {
  type AutocompleteInput,
  GoogleKeyMissing,
  type GooglePlacesError,
  GooglePlacesFailed,
  type LatLng,
  type PlaceCategory,
  type PlaceSuggestion,
} from "@placard/domain"
import { Clock, Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import { HttpClient, HttpClientRequest, type HttpClientResponse } from "effect/http"
import { InstanceSettings } from "../settings/instance-settings.ts"
import { categoryFromGoogleTypes } from "./category.ts"

export const PLACES_BASE_URL = "https://places.googleapis.com/v1"

/** Only the fields Placard stores, which keeps Place Details in the cheapest SKU that has them. */
export const DETAILS_FIELD_MASK =
  "id,displayName,formattedAddress,location,types,primaryType,utcOffsetMinutes,nationalPhoneNumber,internationalPhoneNumber,websiteUri,rating,priceLevel,regularOpeningHours"

export const AUTOCOMPLETE_FIELD_MASK =
  "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat"

const AUTOCOMPLETE_BIAS_RADIUS_METERS = 50_000
const DETAILS_CACHE_TTL_MS = 10 * 60 * 1000
const DETAILS_CACHE_MAX = 500

const Text = Schema.Struct({ text: Schema.String })

export const GoogleAutocompleteResponse = Schema.Struct({
  suggestions: Schema.optional(
    Schema.Array(
      Schema.Struct({
        placePrediction: Schema.optional(
          Schema.Struct({
            placeId: Schema.String,
            text: Text,
            structuredFormat: Schema.optional(
              Schema.Struct({ mainText: Text, secondaryText: Schema.optional(Text) }),
            ),
          }),
        ),
      }),
    ),
  ),
})

const TimeOfDay = Schema.Struct({
  day: Schema.Number,
  hour: Schema.Number,
  minute: Schema.Number,
})

export const GooglePlaceResponse = Schema.Struct({
  id: Schema.String,
  displayName: Schema.optional(Text),
  formattedAddress: Schema.optional(Schema.String),
  location: Schema.Struct({ latitude: Schema.Number, longitude: Schema.Number }),
  types: Schema.optional(Schema.Array(Schema.String)),
  primaryType: Schema.optional(Schema.String),
  utcOffsetMinutes: Schema.optional(Schema.Number),
  nationalPhoneNumber: Schema.optional(Schema.String),
  internationalPhoneNumber: Schema.optional(Schema.String),
  websiteUri: Schema.optional(Schema.String),
  rating: Schema.optional(Schema.Number),
  priceLevel: Schema.optional(Schema.String),
  regularOpeningHours: Schema.optional(
    Schema.Struct({
      periods: Schema.optional(
        Schema.Array(
          Schema.Struct({
            open: TimeOfDay,
            close: Schema.optional(TimeOfDay),
          }),
        ),
      ),
      weekdayDescriptions: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),
})

const GoogleErrorBody = Schema.Struct({
  error: Schema.Struct({ message: Schema.String }),
})

export interface GooglePlaceDetails {
  readonly googlePlaceId: string
  readonly name: string
  readonly address: string | null
  readonly location: LatLng
  readonly category: PlaceCategory
  readonly utcOffsetMinutes: number | null
  readonly enrichment: {
    readonly nationalPhoneNumber?: string
    readonly internationalPhoneNumber?: string
    readonly websiteUri?: string
    readonly rating?: number
    readonly priceLevel?: string
    readonly types?: ReadonlyArray<string>
    readonly primaryType?: string
    readonly regularOpeningHours?: typeof GooglePlaceResponse.Type.regularOpeningHours
  }
}

export const toSuggestions = (
  response: typeof GoogleAutocompleteResponse.Type,
): ReadonlyArray<PlaceSuggestion> =>
  (response.suggestions ?? []).flatMap(({ placePrediction: p }) =>
    p
      ? [
          {
            googlePlaceId: p.placeId,
            primaryText: p.structuredFormat?.mainText.text ?? p.text.text,
            secondaryText: p.structuredFormat?.secondaryText?.text ?? null,
          },
        ]
      : [],
  )

export const toDetails = (place: typeof GooglePlaceResponse.Type): GooglePlaceDetails => ({
  googlePlaceId: place.id,
  name: place.displayName?.text ?? place.formattedAddress ?? "Unnamed place",
  address: place.formattedAddress ?? null,
  location: { lat: place.location.latitude, lng: place.location.longitude },
  category: categoryFromGoogleTypes(place.primaryType, place.types ?? []),
  utcOffsetMinutes: place.utcOffsetMinutes ?? null,
  enrichment: {
    ...(place.nationalPhoneNumber !== undefined
      ? { nationalPhoneNumber: place.nationalPhoneNumber }
      : {}),
    ...(place.internationalPhoneNumber !== undefined
      ? { internationalPhoneNumber: place.internationalPhoneNumber }
      : {}),
    ...(place.websiteUri !== undefined ? { websiteUri: place.websiteUri } : {}),
    ...(place.rating !== undefined ? { rating: place.rating } : {}),
    ...(place.priceLevel !== undefined ? { priceLevel: place.priceLevel } : {}),
    ...(place.types !== undefined ? { types: place.types } : {}),
    ...(place.primaryType !== undefined ? { primaryType: place.primaryType } : {}),
    ...(place.regularOpeningHours !== undefined
      ? { regularOpeningHours: place.regularOpeningHours }
      : {}),
  },
})

export interface TextSearchHit {
  readonly googlePlaceId: string
  readonly name: string
  readonly address: string | null
  readonly location: LatLng | null
}

export class GooglePlaces extends Context.Service<
  GooglePlaces,
  {
    readonly autocomplete: (
      input: AutocompleteInput,
    ) => Effect.Effect<ReadonlyArray<PlaceSuggestion>, GooglePlacesError>
    /** Cached for a few minutes, so preview-then-save costs one Details call. */
    readonly details: (
      googlePlaceId: string,
      sessionToken: string | null,
      options?: { readonly force?: boolean },
    ) => Effect.Effect<GooglePlaceDetails, GooglePlacesError>
    /** Used by Takeout commit to match name (+ optional location bias). */
    readonly searchText: (
      query: string,
      near: LatLng | null,
    ) => Effect.Effect<ReadonlyArray<TextSearchHit>, GooglePlacesError>
  }
>()("placard/GooglePlaces") {
  static readonly layer = Layer.effect(
    GooglePlaces,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const settings = yield* InstanceSettings
      const cache = new Map<string, { readonly details: GooglePlaceDetails; readonly at: number }>()

      const apiKey = settings.googleApiKey.pipe(
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.fail(
                new GoogleKeyMissing({
                  message: "No Google API key is set. Ask your admin to add one in Settings.",
                }),
              ),
            onSome: Effect.succeed,
          }),
        ),
      )

      const send = <S extends Schema.Top & { readonly DecodingServices: never }>(
        request: HttpClientRequest.HttpClientRequest,
        schema: S,
      ) =>
        Effect.gen(function* () {
          const key = yield* apiKey
          const response = yield* client
            .execute(HttpClientRequest.setHeader(request, "X-Goog-Api-Key", Redacted.value(key)))
            .pipe(
              Effect.timeout("10 seconds"),
              Effect.mapError(
                (error) =>
                  new GooglePlacesFailed({ message: `Could not reach Google: ${error.message}` }),
              ),
            )
          if (response.status < 200 || response.status >= 300) {
            return yield* failureFrom(response)
          }
          return yield* response.json.pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(schema)),
            Effect.mapError(
              () =>
                new GooglePlacesFailed({ message: "Google sent a response Placard can't read." }),
            ),
          )
        })

      return {
        autocomplete: Effect.fn("GooglePlaces.autocomplete")(function* ({
          input,
          sessionToken,
          near,
          includedPrimaryTypes,
        }) {
          const request = HttpClientRequest.post(`${PLACES_BASE_URL}/places:autocomplete`).pipe(
            HttpClientRequest.setHeader("X-Goog-FieldMask", AUTOCOMPLETE_FIELD_MASK),
            HttpClientRequest.bodyJsonUnsafe({
              input,
              sessionToken,
              ...(includedPrimaryTypes && includedPrimaryTypes.length > 0
                ? { includedPrimaryTypes: [...includedPrimaryTypes] }
                : {}),
              ...(near && {
                locationBias: {
                  circle: {
                    center: { latitude: near.lat, longitude: near.lng },
                    radius: AUTOCOMPLETE_BIAS_RADIUS_METERS,
                  },
                },
              }),
            }),
          )
          return toSuggestions(yield* send(request, GoogleAutocompleteResponse))
        }),

        details: Effect.fn("GooglePlaces.details")(
          function* (googlePlaceId, sessionToken, options) {
            const now = yield* Clock.currentTimeMillis
            const cached = cache.get(googlePlaceId)
            if (!options?.force && cached && now - cached.at < DETAILS_CACHE_TTL_MS)
              return cached.details

            const request = HttpClientRequest.get(
              `${PLACES_BASE_URL}/places/${encodeURIComponent(googlePlaceId)}`,
            ).pipe(
              HttpClientRequest.setHeader("X-Goog-FieldMask", DETAILS_FIELD_MASK),
              sessionToken ? HttpClientRequest.setUrlParam("sessionToken", sessionToken) : (r) => r,
            )
            const details = toDetails(yield* send(request, GooglePlaceResponse))

            if (cache.size >= DETAILS_CACHE_MAX) cache.clear()
            cache.set(googlePlaceId, { details, at: now })
            return details
          },
        ),

        searchText: Effect.fn("GooglePlaces.searchText")(function* (query, near) {
          const request = HttpClientRequest.post(`${PLACES_BASE_URL}/places:searchText`).pipe(
            HttpClientRequest.setHeader(
              "X-Goog-FieldMask",
              "places.id,places.displayName,places.formattedAddress,places.location",
            ),
            HttpClientRequest.bodyJsonUnsafe({
              textQuery: query,
              pageSize: 5,
              ...(near && {
                locationBias: {
                  circle: {
                    center: { latitude: near.lat, longitude: near.lng },
                    radius: 5_000,
                  },
                },
              }),
            }),
          )
          const body = yield* send(
            request,
            Schema.Struct({
              places: Schema.optional(
                Schema.Array(
                  Schema.Struct({
                    id: Schema.String,
                    displayName: Schema.optional(Text),
                    formattedAddress: Schema.optional(Schema.String),
                    location: Schema.optional(
                      Schema.Struct({ latitude: Schema.Number, longitude: Schema.Number }),
                    ),
                  }),
                ),
              ),
            }),
          )
          return (body.places ?? []).map((place) => ({
            googlePlaceId: place.id,
            name: place.displayName?.text ?? place.formattedAddress ?? "Unnamed place",
            address: place.formattedAddress ?? null,
            location: place.location
              ? { lat: place.location.latitude, lng: place.location.longitude }
              : null,
          }))
        }),
      }
    }),
  )
}

const failureFrom = (response: HttpClientResponse.HttpClientResponse) =>
  response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(GoogleErrorBody)),
    Effect.map((body) => body.error.message),
    Effect.orElseSucceed(() => `HTTP ${response.status}`),
    Effect.flatMap((detail) =>
      Effect.fail(new GooglePlacesFailed({ message: `Google Places: ${detail}` })),
    ),
  )
