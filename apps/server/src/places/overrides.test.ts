import { describe, expect, it } from "@effect/vitest"
import { applyEdit, applyFetched, type Overridable } from "./overrides.ts"

const base: Overridable = {
  values: { name: "Café Sperl", category: "cafe", address: "Gumpendorfer Str. 11" },
  manual: [],
}

describe("override rules", () => {
  it("remembers fields the owner changes", () => {
    expect(applyEdit(base, { name: "Sperl" })).toEqual({
      values: { name: "Sperl", category: "cafe", address: "Gumpendorfer Str. 11" },
      manual: ["name"],
    })
  })

  it("does not pin a field when the value is unchanged", () => {
    expect(applyEdit(base, { name: "Café Sperl", category: "cafe" }).manual).toEqual([])
  })

  it("lets a Google refresh overwrite fields the owner has not touched", () => {
    const edited = applyEdit(base, { name: "Sperl" })
    expect(
      applyFetched(edited, {
        name: "Café Sperl",
        category: "restaurant",
        address: "Gumpendorfer Straße 11",
      }),
    ).toEqual({
      values: { name: "Sperl", category: "restaurant", address: "Gumpendorfer Straße 11" },
      manual: ["name"],
    })
  })

  it("clears an address and remembers that as a manual edit", () => {
    expect(applyEdit(base, { address: null })).toEqual({
      values: { name: "Café Sperl", category: "cafe", address: null },
      manual: ["address"],
    })
  })

  it("keeps the manual set ordered and unique across edits", () => {
    const once = applyEdit(base, { category: "bar", address: null })
    expect(applyEdit(once, { name: "Sperl", category: "restaurant" }).manual).toEqual([
      "name",
      "category",
      "address",
    ])
  })
})
