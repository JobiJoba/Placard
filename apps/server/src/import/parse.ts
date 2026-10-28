/**
 * Pure Takeout parser — no I/O, no API calls.
 * Format notes: docs/takeout-format.md
 */
import { createHash } from "node:crypto"
import { unzipSync } from "fflate"

export interface TakeoutFile {
  readonly path: string
  readonly text: string
}

export interface ParsedTakeoutEntry {
  readonly dedupeKey: string
  readonly sourceFile: string
  readonly sourceList: string | null
  readonly name: string | null
  readonly address: string | null
  readonly countryCode: string | null
  readonly note: string | null
  readonly location: { readonly lat: number; readonly lng: number } | null
  readonly googleMapsUrl: string | null
  readonly cid: string | null
  readonly featureId: string | null
  readonly savedAt: string | null
  readonly needsLocation: boolean
}

export interface ParseResult {
  readonly fingerprint: string
  readonly entries: ReadonlyArray<ParsedTakeoutEntry>
}

const normalizePath = (path: string) => path.replace(/\\/g, "/").replace(/^\.\//, "")

const isNullIsland = (lng: number, lat: number) => Math.abs(lng) < 1e-9 && Math.abs(lat) < 1e-9

/** Extract cid=… or 0x…:0x… / ftid / 1s0x feature ids from a Maps URL. */
export const extractMapsSignals = (
  url: string | null | undefined,
): { cid: string | null; featureId: string | null } => {
  if (!url) return { cid: null, featureId: null }
  const cid = url.match(/[?&]cid=(\d+)/i)?.[1] ?? null
  const featureId =
    url.match(/[?&]ftid=(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1] ??
    url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1] ??
    url.match(/\/(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1] ??
    null
  return { cid, featureId }
}

/** Dropped-pin URLs: /maps/search/<lat>,<lng> */
export const extractSearchCoords = (
  url: string | null | undefined,
): { lat: number; lng: number } | null => {
  if (!url) return null
  const match = url.match(/\/maps\/search\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i)
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || isNullIsland(lng, lat)) return null
  return { lat, lng }
}

export const dedupeKeyFor = (entry: {
  readonly cid: string | null
  readonly featureId: string | null
  readonly name: string | null
  readonly location: { readonly lat: number; readonly lng: number } | null
  readonly googleMapsUrl: string | null
}): string => {
  if (entry.cid) return `cid:${entry.cid}`
  if (entry.featureId) return `fid:${entry.featureId.toLowerCase()}`
  if (entry.name && entry.location) {
    const lat = entry.location.lat.toFixed(4)
    const lng = entry.location.lng.toFixed(4)
    return `nl:${entry.name.trim().toLowerCase()}@${lat},${lng}`
  }
  if (entry.name && entry.googleMapsUrl) {
    return `nu:${entry.name.trim().toLowerCase()}|${entry.googleMapsUrl}`
  }
  if (entry.googleMapsUrl) return `url:${entry.googleMapsUrl}`
  return `anon:${entry.name ?? "unnamed"}`
}

const fingerprintOf = (files: ReadonlyArray<TakeoutFile>): string => {
  const hash = createHash("sha256")
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path)
    hash.update("\0")
    hash.update(file.text)
    hash.update("\0")
  }
  return hash.digest("hex")
}

const parseSavedPlacesJson = (sourceFile: string, text: string): ParsedTakeoutEntry[] => {
  const body = JSON.parse(text) as {
    features?: ReadonlyArray<{
      geometry?: { coordinates?: ReadonlyArray<number> }
      properties?: {
        date?: string
        google_maps_url?: string
        Comment?: string
        location?: { name?: string; address?: string; country_code?: string }
      }
    }>
  }
  const out: ParsedTakeoutEntry[] = []
  for (const feature of body.features ?? []) {
    const props = feature.properties ?? {}
    const coords = feature.geometry?.coordinates
    const lng = coords?.[0]
    const lat = coords?.[1]
    const hasCoords =
      typeof lng === "number" &&
      typeof lat === "number" &&
      Number.isFinite(lng) &&
      Number.isFinite(lat)
    const nullIsland = hasCoords && isNullIsland(lng!, lat!)
    const locationObj = props.location
    const needsLocation = !locationObj || !hasCoords || nullIsland
    const { cid, featureId } = extractMapsSignals(props.google_maps_url)
    const location = needsLocation || !hasCoords ? null : { lat: lat!, lng: lng! }
    const entry = {
      sourceFile,
      sourceList: null,
      name: locationObj?.name ?? null,
      address: locationObj?.address ?? null,
      countryCode: locationObj?.country_code ?? null,
      note: props.Comment ?? null,
      location,
      googleMapsUrl: props.google_maps_url ?? null,
      cid,
      featureId,
      savedAt: props.date ?? null,
      needsLocation,
      dedupeKey: "",
    }
    out.push({ ...entry, dedupeKey: dedupeKeyFor(entry) })
  }
  return out
}

/** Minimal CSV split that respects quoted fields. */
export const splitCsvLine = (line: string): string[] => {
  const cells: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      cells.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

const parseSavedCsv = (
  sourceFile: string,
  listName: string,
  text: string,
): ParsedTakeoutEntry[] => {
  const lines = text.split(/\r?\n/)
  if (lines.length === 0) return []
  const header = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase())
  const idx = (name: string) => header.indexOf(name)
  const titleI = idx("title")
  const noteI = idx("note")
  const urlI = idx("url")
  const commentI = idx("comment")
  const out: ParsedTakeoutEntry[] = []

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    if (raw === undefined || raw.trim() === "") continue
    const cells = splitCsvLine(raw)
    const title = (titleI >= 0 ? cells[titleI] : "")?.trim() ?? ""
    const note = (noteI >= 0 ? cells[noteI] : "")?.trim() || null
    const url = (urlI >= 0 ? cells[urlI] : "")?.trim() || null
    const comment = (commentI >= 0 ? cells[commentI] : "")?.trim() || null
    if (!title && !url) continue

    const { cid, featureId } = extractMapsSignals(url)
    const searchCoords = extractSearchCoords(url)
    const entry = {
      sourceFile,
      sourceList: listName,
      name: title || null,
      address: null,
      countryCode: null,
      note: note ?? comment,
      location: searchCoords,
      googleMapsUrl: url,
      cid,
      featureId,
      savedAt: null,
      // CSV rows usually lack coords; they still triage by name. Only flag when empty.
      needsLocation: !title && searchCoords === null,
      dedupeKey: "",
    }
    out.push({ ...entry, dedupeKey: dedupeKeyFor(entry) })
  }
  return out
}

const listNameFromCsvPath = (path: string): string => {
  const base = path.split("/").pop() ?? path
  return base.replace(/\.csv$/i, "")
}

const isSavedPlacesJson = (path: string) =>
  /(?:^|\/)Maps \(your places\)\/Saved Places\.json$/i.test(path) ||
  /(?:^|\/)Saved Places\.json$/i.test(path)

const isSavedCsv = (path: string) => /(?:^|\/)Saved\/[^/]+\.csv$/i.test(path)

export const parseTakeoutFiles = (files: ReadonlyArray<TakeoutFile>): ParseResult => {
  const normalized = files.map((f) => ({ path: normalizePath(f.path), text: f.text }))
  const fingerprint = fingerprintOf(normalized)
  const entries: ParsedTakeoutEntry[] = []

  for (const file of normalized) {
    if (isSavedPlacesJson(file.path)) {
      entries.push(...parseSavedPlacesJson(file.path, file.text))
    } else if (isSavedCsv(file.path)) {
      entries.push(...parseSavedCsv(file.path, listNameFromCsvPath(file.path), file.text))
    }
  }

  return { fingerprint, entries }
}

/** Unpack a Takeout zip into text files the parser understands. */
export const unzipTakeout = (bytes: Uint8Array): TakeoutFile[] => {
  const unzipped = unzipSync(bytes)
  const files: TakeoutFile[] = []
  for (const [path, data] of Object.entries(unzipped)) {
    if (path.endsWith("/") || data === undefined) continue
    const normalized = normalizePath(path)
    if (isSavedPlacesJson(normalized) || isSavedCsv(normalized)) {
      files.push({ path: normalized, text: new TextDecoder("utf-8").decode(data) })
    }
  }
  return files
}

export const decodeBase64Zip = (contentBase64: string): Uint8Array => {
  const binary = Buffer.from(contentBase64, "base64")
  return new Uint8Array(binary)
}
