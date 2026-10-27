import { describe, expect, it } from "@effect/vitest"
import { appleMapsUrl, googleMapsUrl, organicMapsUrl } from "@placard/domain"

const googlePlace = {
  name: "Café Sperl",
  address: "Gumpendorfer Str. 11, 1060 Wien, Austria",
  location: { lat: 48.2008946, lng: 16.3600893 },
  googlePlaceId: "ChIJ-fixture-cafe-sperl",
}

const pinnedPlace = { ...googlePlace, address: null, googlePlaceId: null }

const params = (url: string) => Object.fromEntries(new URL(url).searchParams)

describe("map links", () => {
  it("opens Google Maps on the exact place when it has a Place ID", () => {
    const url = googleMapsUrl(googlePlace)
    expect(url.startsWith("https://www.google.com/maps/search/?")).toBe(true)
    expect(params(url)).toEqual({
      api: "1",
      query: "Café Sperl, Gumpendorfer Str. 11, 1060 Wien, Austria",
      query_place_id: "ChIJ-fixture-cafe-sperl",
    })
  })

  it("opens Google Maps at the coordinates for a manual pin", () => {
    expect(params(googleMapsUrl(pinnedPlace))).toEqual({
      api: "1",
      query: "48.2008946,16.3600893",
    })
  })

  it("opens Apple Maps with the name at the coordinates", () => {
    const url = appleMapsUrl(googlePlace)
    expect(url.startsWith("https://maps.apple.com/?")).toBe(true)
    expect(params(url)).toEqual({ q: "Café Sperl", ll: "48.2008946,16.3600893" })
  })

  it("opens Organic Maps with its om:// scheme", () => {
    const url = organicMapsUrl(googlePlace)
    expect(url.startsWith("om://map?")).toBe(true)
    expect(Object.fromEntries(new URLSearchParams(url.slice("om://map?".length)))).toEqual({
      v: "1",
      ll: "48.2008946,16.3600893",
      n: "Café Sperl",
    })
  })
})
