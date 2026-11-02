import { describe, expect, it } from "vitest"
import { actionCounts, billingPeriod, costMicros, totalMicros } from "./pricing.ts"

describe("Google cost estimates", () => {
  it("applies allowances independently and charges only the excess", () => {
    expect(totalMicros({ details: 1000, photo: 1000, search: 5000 }, true)).toBe(0)
    expect(totalMicros({ details: 1001, photo: 999 }, true)).toBe(20000)
    expect(totalMicros({ details: 1000, photo: 1000 }, false)).toBe(27000000)
  })
  it("keeps session details in their own SKU and session autocomplete free", () => {
    expect(costMicros("autocompleteSession", 20000, false)).toBe(0)
    expect(totalMicros({ details: 1000, detailsSession: 1001 }, true)).toBe(25000)
  })
  it("estimates imports including photos, and bulk refreshes without searches", () => {
    expect(totalMicros(actionCounts({ action: "refresh", count: 200 }), false) / 1e6).toBe(5.4)
    expect(totalMicros(actionCounts({ action: "import", count: 200 }), false) / 1e6).toBe(11.8)
    expect(totalMicros(actionCounts({ action: "add", count: 1 }), false) / 1e6).toBe(0.032)
  })
  it("resets on the Pacific calendar boundary, including DST and year rollover", () => {
    expect(billingPeriod(new Date("2026-11-01T06:59:59Z")).month).toBe("2026-10")
    expect(billingPeriod(new Date("2026-11-01T07:00:00Z")).month).toBe("2026-11")
    expect(billingPeriod(new Date("2027-01-01T07:59:59Z"))).toEqual({
      month: "2026-12",
      resetsAt: "2027-01-01 (Pacific time)",
    })
    expect(billingPeriod(new Date("2027-01-01T08:00:00Z")).month).toBe("2027-01")
  })
})
