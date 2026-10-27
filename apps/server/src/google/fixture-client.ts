import { Effect, Layer } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import autocompleteFixture from "./fixtures/autocomplete.json" with { type: "json" }
import placesFixture from "./fixtures/places.json" with { type: "json" }

export const fixturePlaces: Readonly<
  Record<string, (typeof placesFixture)[keyof typeof placesFixture]>
> = placesFixture

const INVALID_KEY = {
  error: {
    code: 400,
    message: "API key not valid. Please pass a valid API key.",
    status: "INVALID_ARGUMENT",
  },
}

const jsonBody = (request: HttpClientRequest.HttpClientRequest): Record<string, unknown> =>
  request.body._tag === "Uint8Array" ? JSON.parse(new TextDecoder().decode(request.body.body)) : {}

const respond = (request: HttpClientRequest.HttpClientRequest, url: URL): Response => {
  if (request.headers["x-goog-api-key"]?.includes("invalid")) {
    return Response.json(INVALID_KEY, { status: 400 })
  }
  if (request.method === "POST" && url.pathname === "/v1/places:searchText") {
    return Response.json({ places: [{ id: "ChIJ-fixture-da-michele" }] })
  }
  if (request.method === "POST" && url.pathname === "/v1/places:autocomplete") {
    const input = String(jsonBody(request).input ?? "").toLowerCase()
    const suggestions = autocompleteFixture.suggestions.filter(({ placePrediction }) =>
      placePrediction.text.text.toLowerCase().includes(input),
    )
    return Response.json(suggestions.length > 0 ? { suggestions } : {})
  }
  const details = url.pathname.match(/^\/v1\/places\/([^/:]+)$/)
  if (request.method === "GET" && details?.[1]) {
    const place = fixturePlaces[decodeURIComponent(details[1])]
    if (place) return Response.json(place)
    return Response.json(
      { error: { code: 404, message: "Requested entity was not found.", status: "NOT_FOUND" } },
      { status: 404 },
    )
  }
  return Response.json({ error: { code: 404, message: `No fixture for ${url}` } }, { status: 404 })
}

/**
 * Stands in for Google's Places API using recorded-shape fixtures. Keys
 * containing "invalid" are rejected like Google does. Used by tests and by
 * `PLACARD_FAKE_GOOGLE=true`.
 */
export const GoogleFixtureClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request, url) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, respond(request, url))),
  ),
)
