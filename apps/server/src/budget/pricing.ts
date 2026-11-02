import type { CostEstimateInput, UsageSku } from "@placard/domain"

// Standard global PAYG, USD, checked 2026-11-02. First paid tier deliberately
// ignores volume discounts, subscriptions, taxes, FX and negotiated pricing.
// https://developers.google.com/maps/billing-and-pricing/pricing
export const PRICING_DATE = "2026-11-02"
export const PRICES: Record<UsageSku, { label: string; free: number | null; micros: number }> = {
  maps: { label: "Dynamic map loads", free: 10000, micros: 7000 },
  autocomplete: {
    label: "Autocomplete requests (including unfinished sessions)",
    free: 10000,
    micros: 2830,
  },
  autocompleteSession: { label: "Autocomplete in completed sessions", free: null, micros: 0 },
  details: { label: "Place Details Enterprise", free: 1000, micros: 20000 },
  detailsSession: {
    label: "Place Details Enterprise + Atmosphere (session)",
    free: 1000,
    micros: 25000,
  },
  search: { label: "Text Search Pro", free: 5000, micros: 32000 },
  photo: { label: "Place photos", free: 1000, micros: 7000 },
}
export type Counts = Partial<Record<UsageSku, number>>
export const costMicros = (sku: UsageSku, count: number, free: boolean) =>
  Math.max(0, count - (free ? (PRICES[sku].free ?? count) : 0)) * PRICES[sku].micros
export const totalMicros = (counts: Counts, free: boolean) =>
  Object.keys(PRICES).reduce(
    (total, sku) => total + costMicros(sku as UsageSku, counts[sku as UsageSku] ?? 0, free),
    0,
  )
export const actionCounts = ({ action, count }: CostEstimateInput): Counts =>
  action === "map"
    ? { maps: count }
    : {
        [action === "add" ? "detailsSession" : "details"]: count,
        photo: count,
        ...(action === "import" ? { search: count } : {}),
      }
// Google Maps monthly usage periods follow US Pacific time, including DST.
export function billingPeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now)
  const year = Number(parts.find((p) => p.type === "year")?.value)
  const month = Number(parts.find((p) => p.type === "month")?.value)
  return {
    month: `${year}-${String(month).padStart(2, "0")}`,
    resetsAt: `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01 (Pacific time)`,
  }
}
