import { describe, expect, it } from "@effect/vitest"
import { resolveModuleMediaUrl } from "./modules.ts"

describe("resolveModuleMediaUrl", () => {
  it("passes through absolute http and root-relative URLs", () => {
    expect(resolveModuleMediaUrl("x", "bundled", "https://cdn.example/cover.png")).toBe(
      "https://cdn.example/cover.png",
    )
    expect(resolveModuleMediaUrl("restaurants.decide", "bundled", "/module-covers/decide.svg")).toBe(
      "/module-covers/decide.svg",
    )
  })

  it("maps relative upload paths to the asset route", () => {
    expect(resolveModuleMediaUrl("places.pick", "upload", "./web/assets/cover.svg")).toBe(
      "/api/modules/places.pick/assets/web/assets/cover.svg",
    )
  })

  it("returns null for empty or relative bundled paths", () => {
    expect(resolveModuleMediaUrl("x", "bundled", "")).toBeNull()
    expect(resolveModuleMediaUrl("x", "bundled", "./icon.png")).toBeNull()
  })
})
