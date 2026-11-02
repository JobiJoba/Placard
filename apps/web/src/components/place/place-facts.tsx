import type { Place } from "@placard/domain"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"

const priceLabels: Record<string, string> = {
  free: "Free",
  inexpensive: "Inexpensive",
  moderate: "Moderate",
  expensive: "Expensive",
  very_expensive: "Very expensive",
}

export function PlaceFactsSection({ place }: { readonly place: Place }) {
  const { facts } = place
  const weekday = facts.openingHours?.weekdayDescriptions
  const hours = useMemo(() => splitHours(weekday), [weekday])
  const [hoursOpen, setHoursOpen] = useState(false)

  const hasFacts =
    facts.phone ||
    facts.website ||
    facts.rating != null ||
    facts.priceLevel ||
    facts.cuisine ||
    (weekday && weekday.length > 0)

  if (!hasFacts) return null

  return (
    <section className="flex flex-col gap-4 border-t pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">Details</h2>
        {facts.fromGoogle && (
          <p className="text-xs text-muted-foreground">
            Place data from{" "}
            <a
              href="https://maps.google.com"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Google
            </a>
          </p>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {facts.cuisine && (
          <>
            <dt className="text-muted-foreground">Cuisine</dt>
            <dd>{facts.cuisine}</dd>
          </>
        )}
        {facts.rating != null && (
          <>
            <dt className="text-muted-foreground">Rating</dt>
            <dd className="tabular-nums">{facts.rating.toFixed(1)}★</dd>
          </>
        )}
        {facts.priceLevel && (
          <>
            <dt className="text-muted-foreground">Price</dt>
            <dd>{priceLabels[facts.priceLevel] ?? facts.priceLevel}</dd>
          </>
        )}
        {facts.phone && (
          <>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>
              <a href={`tel:${facts.phone}`} className="underline underline-offset-2">
                {facts.phone}
              </a>
            </dd>
          </>
        )}
        {facts.website && (
          <>
            <dt className="text-muted-foreground">Website</dt>
            <dd>
              <a
                href={facts.website}
                target="_blank"
                rel="noreferrer"
                className="break-all underline underline-offset-2"
              >
                {friendlyWebsite(facts.website)}
              </a>
            </dd>
          </>
        )}
        {weekday && weekday.length > 0 && (
          <>
            <dt className="text-muted-foreground">Hours</dt>
            <dd>
              {hours.today ? (
                <div className="flex flex-col gap-1">
                  <p>
                    <span className="font-medium">Today</span> —{" "}
                    {hours.today.replace(/^[^:]+:\s*/, "")}
                  </p>
                  {hours.rest.length > 0 ? (
                    <>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto w-fit px-0"
                        onClick={() => setHoursOpen((v) => !v)}
                        aria-expanded={hoursOpen}
                      >
                        {hoursOpen ? "Hide full week" : "Show full week"}
                      </Button>
                      {hoursOpen ? (
                        <ul className="flex flex-col gap-0.5 text-muted-foreground">
                          {weekday.map((line) => (
                            <li
                              key={line}
                              className={
                                line === hours.today ? "font-medium text-foreground" : undefined
                              }
                            >
                              {line}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {weekday.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </dd>
          </>
        )}
      </dl>
    </section>
  )
}

function friendlyWebsite(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, "")
    const path = parsed.pathname === "/" ? "" : parsed.pathname
    const display = `${host}${path}`
    return display.length > 48 ? `${display.slice(0, 46)}…` : display
  } catch {
    return url.replace(/^https?:\/\//, "")
  }
}

function splitHours(descs: ReadonlyArray<string> | null | undefined): {
  readonly today: string | null
  readonly rest: ReadonlyArray<string>
} {
  if (!descs || descs.length === 0) return { today: null, rest: [] }
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date())
  const today = descs.find((line) => line.toLowerCase().startsWith(day.toLowerCase())) ?? null
  return { today, rest: descs.filter((line) => line !== today) }
}
