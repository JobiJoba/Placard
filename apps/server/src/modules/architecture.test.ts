import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "@effect/vitest"
import { restaurantsDecideManifest } from "@placard/module-restaurants-decide/manifest"

describe("module plugin architecture", () => {
  it("ships Decide as a catalogued bundled module", () => {
    expect(restaurantsDecideManifest.id).toBe("restaurants.decide")
    expect(restaurantsDecideManifest.source).toBe("bundled")
    expect(restaurantsDecideManifest.nav[0]?.path).toBe("/m/restaurants.decide")
  })

  it("core catalog imports the reference package, not place SQL helpers", () => {
    const catalogPath = fileURLToPath(new URL("./catalog.ts", import.meta.url))
    const source = readFileSync(catalogPath, "utf8")
    expect(source).toContain("@placard/module-restaurants-decide")
    expect(source).not.toMatch(/places\/(places|opening-hours|facts)\.ts/)
  })

  it("Decide package server entry uses ModuleHostSearch, not core Search", () => {
    const decidePath = fileURLToPath(
      new URL(
        "../../../../packages/modules/restaurants-decide/src/server/decide.ts",
        import.meta.url,
      ),
    )
    const source = readFileSync(decidePath, "utf8")
    expect(source).toContain("ModuleHostSearch")
    expect(source).not.toContain('from "../../../places/search')
  })
})
