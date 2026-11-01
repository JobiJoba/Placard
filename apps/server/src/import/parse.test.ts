import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "@effect/vitest"
import { MAX_IMPORT_FILES, MAX_IMPORT_ZIP_BYTES } from "@placard/domain"
import { zipSync } from "fflate"
import {
  decodeBase64Zip,
  dedupeKeyFor,
  extractMapsSignals,
  extractSearchCoords,
  parseTakeoutFiles,
  splitCsvLine,
  type TakeoutFile,
  unzipTakeout,
} from "./parse.ts"

const fixtureRoot = fileURLToPath(new URL("../../../../test/fixtures/takeout", import.meta.url))

const walk = (dir: string, base = dir): TakeoutFile[] => {
  const out: TakeoutFile[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, base))
    else {
      out.push({
        path: full.slice(base.length + 1).replace(/\\/g, "/"),
        text: readFileSync(full, "utf8"),
      })
    }
  }
  return out
}

describe("Takeout parser", () => {
  it("splits CSV cells with quotes", () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"])
    expect(splitCsvLine('a,"b""c",d')).toEqual(["a", 'b"c', "d"])
  })

  it("extracts cid and feature ids from Maps URLs", () => {
    expect(extractMapsSignals("http://maps.google.com/?cid=123")).toEqual({
      cid: "123",
      featureId: null,
    })
    expect(
      extractMapsSignals(
        "https://www.google.com/maps/place/X/data=!4m2!3m1!1s0x47a851c65a:0x13aabbccddeeff",
      ),
    ).toEqual({ cid: null, featureId: "0x47a851c65a:0x13aabbccddeeff" })
    expect(
      extractMapsSignals("http://maps.google.com/?q=Some+Lost+Address&ftid=0x47abc:0xdef123"),
    ).toEqual({ cid: null, featureId: "0x47abc:0xdef123" })
  })

  it("extracts dropped-pin search coordinates", () => {
    expect(extractSearchCoords("https://www.google.com/maps/search/40.8498,14.2633")).toEqual({
      lat: 40.8498,
      lng: 14.2633,
    })
    expect(extractSearchCoords("https://www.google.com/maps/search/0,0")).toBeNull()
  })

  it("builds stable dedupe keys", () => {
    expect(
      dedupeKeyFor({ cid: "9", featureId: null, name: null, location: null, googleMapsUrl: null }),
    ).toBe("cid:9")
    expect(
      dedupeKeyFor({
        cid: null,
        featureId: "0xAbC:0xDef",
        name: null,
        location: null,
        googleMapsUrl: null,
      }),
    ).toBe("fid:0xabc:0xdef")
    expect(
      dedupeKeyFor({
        cid: null,
        featureId: null,
        name: " Café ",
        location: { lat: 48.2008946, lng: 16.3600893 },
        googleMapsUrl: null,
      }),
    ).toBe("nl:café@48.2009,16.3601")
  })

  it("parses the committed Takeout fixture corpus", () => {
    const result = parseTakeoutFiles(walk(fixtureRoot))
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/)

    const byName = Object.fromEntries(
      result.entries.filter((e) => e.name).map((e) => [`${e.sourceList ?? "stars"}:${e.name}`, e]),
    )

    expect(byName["stars:Café Sperl"]?.location).toEqual({ lat: 48.2008946, lng: 16.3600893 })
    expect(byName["stars:Café Sperl"]?.cid).toBe("1234567890123456789")
    expect(byName["stars:Café Sperl"]?.needsLocation).toBe(false)

    expect(byName["stars:L'Antica Pizzeria da Michele"]?.countryCode).toBe("IT")

    const unresolved = result.entries.find((e) => e.needsLocation && e.sourceList === null)
    expect(unresolved).toBeDefined()
    expect(unresolved?.location).toBeNull()
    expect(unresolved?.featureId).toBe("0x47abc:0xdef123")

    expect(byName["Want to go:Großer Tiergarten"]?.featureId).toBe("0x47a851c65a:0x13aabbccddeeff")
    expect(byName["Want to go:Dropped pin near Michele"]?.location).toEqual({
      lat: 40.8498,
      lng: 14.2633,
    })

    expect(byName["旅行メモ:Café Sperl"]?.sourceList).toBe("旅行メモ")
    expect(byName["City trip:西村里"]?.note).toBe("Christmas tree")
    expect(byName["City trip:Dropped pin"]?.location).toEqual({
      lat: 25.04599,
      lng: 121.5124305,
    })

    // Empty Default list(1).csv contributes no rows.
    expect(result.entries.some((e) => e.sourceList === "Default list(1)")).toBe(false)

    // Café Sperl appears in Saved Places and 旅行メモ → cross-list candidates.
    const sperl = result.entries.filter((e) => e.name === "Café Sperl")
    expect(sperl.length).toBeGreaterThanOrEqual(2)
  })

  it("rejects an oversized zip before inflating it", () => {
    const oversized = new Uint8Array(MAX_IMPORT_ZIP_BYTES + 1)
    expect(() => unzipTakeout(oversized)).toThrow(/too large/)
  })

  it("rejects a zip with too many Maps files", () => {
    const files: Record<string, Uint8Array> = {}
    for (let i = 0; i <= MAX_IMPORT_FILES; i += 1) {
      files[`Saved/list-${i}.csv`] = new Uint8Array()
    }
    expect(() => unzipTakeout(zipSync(files))).toThrow(/Too many files/)
  })

  it("decodes a base64 zip", () => {
    const bytes = decodeBase64Zip(Buffer.from("PK").toString("base64"))
    expect(Array.from(bytes)).toEqual([0x50, 0x4b])
  })
})
