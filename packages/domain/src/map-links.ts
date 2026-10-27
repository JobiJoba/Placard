import type { Place } from "./places.ts"

type LinkablePlace = Pick<Place, "name" | "location" | "address" | "googlePlaceId">

const coords = ({ location }: LinkablePlace) => `${location.lat},${location.lng}`

const query = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&")

/** https://developers.google.com/maps/documentation/urls/get-started#search-action */
export const googleMapsUrl = (place: LinkablePlace): string =>
  `https://www.google.com/maps/search/?${query(
    place.googlePlaceId
      ? {
          api: "1",
          query: [place.name, place.address].filter(Boolean).join(", "),
          query_place_id: place.googlePlaceId,
        }
      : { api: "1", query: coords(place) },
  )}`

/** https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html */
export const appleMapsUrl = (place: LinkablePlace): string =>
  `https://maps.apple.com/?${query({ q: place.name, ll: coords(place) })}`

/** https://github.com/organicmaps/organicmaps/blob/master/api/README.md */
export const organicMapsUrl = (place: LinkablePlace): string =>
  `om://map?${query({ v: "1", ll: coords(place), n: place.name })}`
