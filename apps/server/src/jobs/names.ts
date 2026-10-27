/** pg-boss queue names and payloads. */

export const ENRICH_PLACE = "enrich.place"

export interface EnrichPlaceJob {
  readonly placeId: string
  readonly ownerId: string
  /** Present when this job is part of a refresh-all run. */
  readonly runId?: string
}

export const enrichPlaceOptions = {
  retryLimit: 5,
  retryDelay: 5,
  retryBackoff: true,
  expireInSeconds: 60 * 30,
} as const
