import { Schema } from "effect"

export const BudgetSettings = Schema.Struct({
  monthlyLimitUsd: Schema.NullOr(
    Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 100000 }))),
  ),
  pauseAtLimit: Schema.Boolean,
  useFreeAllowance: Schema.Boolean,
})
export type BudgetSettings = typeof BudgetSettings.Type

export const UsageSku = Schema.Literals([
  "maps",
  "autocomplete",
  "autocompleteSession",
  "details",
  "detailsSession",
  "search",
  "photo",
])
export type UsageSku = typeof UsageSku.Type
export const BudgetView = Schema.Struct({
  settings: BudgetSettings,
  month: Schema.String,
  resetsAt: Schema.String,
  trackingSince: Schema.String,
  pricingDate: Schema.String,
  estimatedUsd: Schema.Number,
  rows: Schema.Array(
    Schema.Struct({
      sku: UsageSku,
      label: Schema.String,
      requests: Schema.Number,
      freeCap: Schema.NullOr(Schema.Number),
      remainingFree: Schema.NullOr(Schema.Number),
      pricePerThousand: Schema.Number,
      estimatedUsd: Schema.Number,
    }),
  ),
  sources: Schema.Array(Schema.Struct({ source: Schema.String, requests: Schema.Number })),
})
export type BudgetView = typeof BudgetView.Type
export const CostEstimateInput = Schema.Struct({
  action: Schema.Literals(["refresh", "import", "add", "map"]),
  count: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 100000 }))),
})
export type CostEstimateInput = typeof CostEstimateInput.Type
export const CostEstimate = Schema.Struct({
  estimatedUsd: Schema.Number,
  beforeFreeAllowanceUsd: Schema.Number,
  exceedsBudget: Schema.Boolean,
  paused: Schema.Boolean,
  useFreeAllowance: Schema.Boolean,
})
export type CostEstimate = typeof CostEstimate.Type
