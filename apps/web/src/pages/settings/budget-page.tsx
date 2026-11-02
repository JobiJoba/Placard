import { type FormEvent, useEffect, useState } from "react"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"
import { SettingsCard } from "./settings-card"

const loadBudget = () => api((c) => c.admin.budget())
const usd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 3,
  }).format(value)

export function SettingsBudgetPage() {
  const { data, setData, error: loadError, reload } = useLoad(loadBudget)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    const timer = window.setInterval(reload, 30000)
    return () => window.clearInterval(timer)
  }, [reload])
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amount = String(form.get("limit") ?? "").trim()
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      setData(
        await api((c) =>
          c.admin.setBudget({
            payload: {
              monthlyLimitUsd: amount === "" ? null : Number(amount),
              pauseAtLimit: form.get("pause") === "on",
              useFreeAllowance: form.get("free") === "on",
            },
          }),
        ),
      )
      setSaved(true)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }
  const limit = data?.settings.monthlyLimitUsd
  const ratio =
    data && limit != null
      ? limit === 0
        ? data.estimatedUsd > 0
          ? 1
          : 0
        : data.estimatedUsd / limit
      : 0
  return (
    <div className="flex flex-col gap-6">
      <ErrorAlert message={error ?? loadError} />
      <SettingsCard
        title="Usage & budget"
        description="Google Maps estimates shared by everyone on this instance."
      >
        {!data ? (
          <p>Loading usage…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Estimated spend · {data.month}</p>
                <p className="text-3xl font-semibold tabular-nums">
                  {usd(data.estimatedUsd)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    USD{limit != null ? ` of ${usd(limit)} budget` : ""}
                  </span>
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={reload}>
                Refresh usage
              </Button>
            </div>
            {limit != null && (
              <progress
                className="h-2 w-full accent-[var(--crate)]"
                value={Math.min(1, ratio)}
                max={1}
                aria-label="Monthly estimated budget used"
              />
            )}
            {limit != null && ratio >= 0.8 && (
              <p role="status" className="text-sm font-medium">
                {ratio >= 1
                  ? "Your estimated monthly budget has been reached."
                  : "You have used at least 80% of your estimated monthly budget."}{" "}
                {data.settings.pauseAtLimit
                  ? "Requests that would exceed the budget are paused."
                  : "Requests can continue; automatic pausing is off."}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Placard usage only · Tracking since{" "}
              {new Date(data.trackingSince).toLocaleDateString()}. Allowances reset {data.resetsAt}.
              Usage before tracking began and outside this instance is unknown.
            </p>
            <p className="text-sm text-muted-foreground">
              {data.settings.useFreeAllowance
                ? "Estimates assume the full monthly free allowances are available to Placard."
                : "Estimates conservatively exclude free allowances. Enable them below if they are available to this instance."}{" "}
              Failed or interrupted attempts and reserved map loads may be counted even if Google
              does not bill them.
            </p>
            <a
              className="text-sm underline"
              href="https://console.cloud.google.com/billing"
              target="_blank"
              rel="noreferrer"
            >
              Check actual costs in Google Cloud ↗
            </a>
          </div>
        )}
      </SettingsCard>
      {data && (
        <>
          <SettingsCard
            title="Monthly free allowances"
            description="Remaining amounts assume no usage elsewhere on the same Google billing account. These are estimates, not Google quota readings."
          >
            <div className="flex flex-col gap-5">
              {data.rows.map((row) => (
                <div key={row.sku}>
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <span className="font-medium">{row.label}</span>
                    <span className="tabular-nums">
                      {row.requests.toLocaleString()} /{" "}
                      {row.freeCap?.toLocaleString() ?? "unlimited"}
                    </span>
                  </div>
                  {row.freeCap !== null && (
                    <progress
                      className="mt-2 h-2 w-full accent-[var(--crate)]"
                      value={Math.min(row.requests, row.freeCap)}
                      max={row.freeCap}
                      aria-label={`${row.label}: monthly free allowance used`}
                    />
                  )}
                  <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {row.remainingFree === null
                        ? "No charge for completed session autocomplete"
                        : `${row.remainingFree.toLocaleString()} estimated free events remaining · ${usd(row.pricePerThousand)} / 1,000 afterward`}
                    </span>
                    <span>{usd(row.estimatedUsd)} estimated</span>
                  </div>
                </div>
              ))}
            </div>
          </SettingsCard>
          <SettingsCard
            title="Budget controls"
            description="Controls apply to new Google requests from Placard, including background work. They do not cap your Google bill or usage by other apps."
          >
            <form onSubmit={save} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="monthly-budget">
                Monthly budget (USD)
                <Input
                  key={String(limit)}
                  id="monthly-budget"
                  name="limit"
                  type="number"
                  min="0"
                  max="100000"
                  step="0.01"
                  defaultValue={limit ?? ""}
                  placeholder="No budget set"
                />
                <span className="font-normal text-muted-foreground">
                  Leave blank for no limit. A zero budget permits only requests estimated to be
                  free.
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  key={String(data.settings.pauseAtLimit)}
                  className="mt-1"
                  type="checkbox"
                  name="pause"
                  defaultChecked={data.settings.pauseAtLimit}
                />
                <span>
                  Pause requests that would exceed this budget. Background imports may continue
                  saving places without Google enrichment.
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  key={String(data.settings.useFreeAllowance)}
                  className="mt-1"
                  type="checkbox"
                  name="free"
                  defaultChecked={data.settings.useFreeAllowance}
                />
                <span>
                  Apply the full monthly free allowances to this instance’s estimates. Only enable
                  this if earlier usage and other projects have not consumed them.
                </span>
              </label>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save budget"}
                </Button>
                {saved && (
                  <p role="status" className="text-sm">
                    Budget saved.
                  </p>
                )}
              </div>
            </form>
          </SettingsCard>
          <SettingsCard
            title="Where requests come from"
            description="Includes attempted requests. Cached place details do not add requests."
          >
            {data.sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Google requests tracked this month.
              </p>
            ) : (
              <dl className="flex flex-col gap-2">
                {data.sources.map((source) => (
                  <div key={source.source} className="flex justify-between text-sm">
                    <dt>{source.source}</dt>
                    <dd className="tabular-nums">{source.requests.toLocaleString()}</dd>
                  </div>
                ))}
              </dl>
            )}
          </SettingsCard>
          <p className="text-xs text-muted-foreground">
            Standard global pay-as-you-go prices checked {data.pricingDate}, in USD. Estimates
            exclude taxes, currency conversion, subscriptions, negotiated prices and volume
            discounts. Changing an API key does not reset usage.{" "}
            <a
              className="underline"
              href="https://developers.google.com/maps/billing-and-pricing/pricing"
              target="_blank"
              rel="noreferrer"
            >
              Google pricing
            </a>
          </p>
        </>
      )}
    </div>
  )
}
