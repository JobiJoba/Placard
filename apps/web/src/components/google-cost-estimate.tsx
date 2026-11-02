import type { CostEstimateInput } from "@placard/domain"
import { useCallback } from "react"
import { api } from "@/lib/api"
import { useLoad } from "@/lib/use-load"

const usd = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 3,
  }).format(amount)
/** Requests an estimate only; never makes a Google API call. */
export function GoogleCostEstimate({
  action,
  count,
  compact = false,
}: CostEstimateInput & { readonly compact?: boolean }) {
  const { data, error } = useLoad(
    useCallback(
      () => api((c) => c.google.estimate({ payload: { action, count } })),
      [action, count],
    ),
  )
  if (error)
    return (
      <p className="text-sm text-muted-foreground">
        Cost estimate unavailable. Google charges may apply.
      </p>
    )
  if (!data) return <p className="text-sm text-muted-foreground">Estimating Google cost…</p>
  return (
    <div className="flex flex-col gap-1 text-sm" aria-live="polite">
      <p>
        Estimated Google cost: up to <strong>{usd(data.estimatedUsd)} USD</strong>
        {data.useFreeAllowance
          ? " with estimated remaining free allowances"
          : " before free allowances"}
        .
      </p>
      {!compact && (
        <p className="text-xs text-muted-foreground">
          {action === "map"
            ? "Assumes one map load. Picking a place adds a details request; saving may add a photo."
            : action === "import"
              ? "Assumes one text search, one details request and one photo per place."
              : action === "refresh"
                ? "Assumes one details request and one photo per place."
                : "Assumes one completed autocomplete session and one photo. Abandoned searches and map loads are additional."}{" "}
          Cache hits and missing photos can reduce cost; retries can increase it. Estimates cover
          Placard only.
        </p>
      )}
      {data.exceedsBudget && (
        <p className="font-medium">
          {data.paused
            ? "This action may only complete partially: Google requests will pause at the instance’s budget limit."
            : "This action could exceed the instance’s monthly budget."}
        </p>
      )}
    </div>
  )
}
