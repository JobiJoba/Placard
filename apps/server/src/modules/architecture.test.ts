import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "@effect/vitest"
import { restaurantsDecideManifest } from "@placard/module-restaurants-decide/manifest"
import { moduleMcpToolName } from "@placard/module-sdk"

describe("module plugin architecture", () => {
  it("ships Decide as a catalogued bundled module with MCP tools", () => {
    expect(restaurantsDecideManifest.id).toBe("restaurants.decide")
    expect(restaurantsDecideManifest.source).toBe("bundled")
    expect(restaurantsDecideManifest.nav[0]?.path).toBe("/m/restaurants.decide")
    expect(restaurantsDecideManifest.mcpTools?.[0]?.name).toBe("decide_restaurant")
  })

  it("namespaces module MCP tool names by module id", () => {
    expect(moduleMcpToolName("restaurants.decide", "decide_restaurant")).toBe(
      "restaurants_decide__decide_restaurant",
    )
    expect(moduleMcpToolName("places.pick", "pick_place")).toBe("places_pick__pick_place")
    expect(moduleMcpToolName("alpha.spin", "pick_place")).not.toBe(
      moduleMcpToolName("beta.spin", "pick_place"),
    )
  })

  it("core catalog imports the reference package, not place SQL helpers", () => {
    const catalogPath = fileURLToPath(new URL("./catalog.ts", import.meta.url))
    const source = readFileSync(catalogPath, "utf8")
    expect(source).toContain("@placard/module-restaurants-decide")
    expect(source).not.toMatch(/places\/(places|opening-hours|facts)\.ts/)
  })

  it("host MCP tools do not hard-code decide_restaurant", () => {
    const toolsPath = fileURLToPath(new URL("../mcp/tools.ts", import.meta.url))
    const source = readFileSync(toolsPath, "utf8")
    expect(source).not.toContain("decide_restaurant")
    expect(source).not.toContain("@placard/module-restaurants-decide")
  })

  it("host HTTP api does not import Decide server package", () => {
    const apiPath = fileURLToPath(new URL("../http/api.ts", import.meta.url))
    const source = readFileSync(apiPath, "utf8")
    expect(source).not.toContain("@placard/module-restaurants-decide/server")
    expect(source).not.toContain("DecideApi")
  })
})
