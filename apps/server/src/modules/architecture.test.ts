import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "@effect/vitest"
import { moduleMcpToolName } from "@placard/module-sdk"
import { bundledCatalog } from "./catalog.ts"

describe("module plugin architecture", () => {
  it("ships no bundled Marketplace modules (wheels install via zip / GitHub)", () => {
    expect(bundledCatalog).toEqual([])
  })

  it("namespaces module MCP tool names by module id", () => {
    expect(moduleMcpToolName("places.pick", "pick_place")).toBe("places_pick__pick_place")
    expect(moduleMcpToolName("example.skeleton", "skeleton_hello")).toBe(
      "example_skeleton__skeleton_hello",
    )
    expect(moduleMcpToolName("alpha.spin", "pick_place")).not.toBe(
      moduleMcpToolName("beta.spin", "pick_place"),
    )
  })

  it("core catalog does not hard-code a first-party wheel package", () => {
    const catalogPath = fileURLToPath(new URL("./catalog.ts", import.meta.url))
    const source = readFileSync(catalogPath, "utf8")
    expect(source).not.toContain("@placard/module-restaurants-decide")
    expect(source).not.toMatch(/places\/(places|opening-hours|facts)\.ts/)
  })

  it("host MCP tools do not hard-code module tool names", () => {
    const toolsPath = fileURLToPath(new URL("../mcp/tools.ts", import.meta.url))
    const source = readFileSync(toolsPath, "utf8")
    expect(source).not.toContain("decide_restaurant")
    expect(source).not.toContain("pick_place")
    expect(source).not.toContain("@placard/module-restaurants-decide")
  })

  it("host HTTP api does not import module server packages", () => {
    const apiPath = fileURLToPath(new URL("../http/api.ts", import.meta.url))
    const source = readFileSync(apiPath, "utf8")
    expect(source).not.toContain("@placard/module-restaurants-decide")
    expect(source).not.toContain("DecideApi")
  })
})
