/** pg-boss queue names and payloads. */

export const ENRICH_PLACE = "enrich.place"
export const IMPORT_PARSE = "import.parse"
export const IMPORT_COMMIT = "import.commit"

export interface EnrichPlaceJob {
  readonly placeId: string
  readonly ownerId: string
  /** Present when this job is part of a refresh-all run. */
  readonly runId?: string
}

export interface ImportParseJob {
  readonly runId: string
}

export interface ImportCommitJob {
  readonly runId: string
}

export const enrichPlaceOptions = {
  retryLimit: 5,
  retryDelay: 5,
  retryBackoff: true,
  expireInSeconds: 60 * 30,
} as const

export const importJobOptions = {
  retryLimit: 2,
  retryDelay: 5,
  retryBackoff: true,
  expireInSeconds: 60 * 60,
} as const
