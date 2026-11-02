import type { Place, PlaceCategory } from "@placard/domain"
import { Link } from "react-router"
import { Checkbox } from "@/components/ui/checkbox"
import { categoryIcons, categoryLabels, formatDistance, statusLabels } from "@/lib/places"

const sleeveTone: Record<PlaceCategory, string> = {
  restaurant: "oklch(0.72 0.06 55)",
  cafe: "oklch(0.78 0.05 85)",
  bar: "oklch(0.55 0.06 30)",
  park: "oklch(0.72 0.07 145)",
  museum: "oklch(0.7 0.04 250)",
  cinema: "oklch(0.58 0.05 320)",
  hotel: "oklch(0.74 0.04 220)",
  trail: "oklch(0.68 0.07 130)",
  other: "oklch(0.7 0.03 70)",
}

/** Short place line for covers — city/area, not the full postal wall. */
const coverLocality = (address: string | null): string | null => {
  if (!address) return null
  const parts = address
    .split(",")
    .map((p) =>
      p
        .replace(/\b\d{3}-\d{4}\b/g, "")
        .replace(/\b\d{4,6}\b/g, "")
        .replace(/^[-\s]+|[-\s]+$/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
  if (parts.length === 0) return null
  const line = (parts.length === 1 ? parts[0] : parts.slice(-2).join(", ")) ?? null
  if (!line) return null
  return line.length > 42 ? `${line.slice(0, 40).trimEnd()}…` : line
}

export function PlaceCard({
  place,
  distanceMeters,
  distanceUnit,
  selecting,
  selected,
  onToggle,
  viewerId,
  householdEnabled,
}: {
  readonly place: Place
  readonly distanceMeters: number | null
  readonly distanceUnit: "km" | "mi"
  readonly selecting: boolean
  readonly selected: boolean
  readonly onToggle: () => void
  readonly viewerId: string
  readonly householdEnabled: boolean
}) {
  const Icon = categoryIcons[place.category]
  const coverSrc = place.coverThumbUrl
  const locality = coverLocality(place.address)
  const sharedByOther =
    householdEnabled && place.visibility === "household" && place.owner.id !== viewerId
  return (
    <article
      className={`place-cover relative aspect-square h-full overflow-hidden rounded-sm bg-[var(--crate)] text-[var(--parchment)] ${
        selected ? "outline outline-2 outline-offset-2 outline-[var(--spine-gold)]" : ""
      }`}
    >
      {coverSrc ? (
        <>
          <img
            src={coverSrc}
            alt=""
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: [
                "linear-gradient(to top, var(--crate) 0%, color-mix(in srgb, var(--crate) 55%, transparent) 38%, transparent 62%)",
                "linear-gradient(to bottom, color-mix(in srgb, var(--crate) 78%, transparent) 0%, transparent 42%)",
              ].join(", "),
            }}
            aria-hidden
          />
        </>
      ) : (
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background: `linear-gradient(160deg, ${sleeveTone[place.category]} 0%, color-mix(in srgb, var(--crate) 55%, ${sleeveTone[place.category]}) 55%, var(--crate) 100%)`,
          }}
          aria-hidden
        />
      )}
      {place.status && (
        <span
          role="img"
          className={`absolute top-0 left-0 z-[1] w-full ${
            place.status === "been_there" ? "status-density-been" : "status-density-want"
          }`}
          aria-label={statusLabels[place.status]}
          title={statusLabels[place.status]}
        />
      )}
      {selecting ? (
        <div className="cover-check absolute top-2 right-2 z-10">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            aria-label={`Select ${place.name}`}
            className="border-[var(--parchment)] data-[state=checked]:bg-[var(--action)] data-[state=checked]:text-[var(--action-fg)]"
          />
        </div>
      ) : null}
      <Link
        to={`/places/${place.id}`}
        className={`cover-face relative z-[1] flex h-full flex-col justify-between gap-2 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--spine-gold)] ${
          selecting ? "pr-9" : ""
        }`}
      >
        <div className="cover-meta flex items-center gap-1.5 text-xs font-medium tracking-wide text-[var(--parchment)] uppercase [text-shadow:0_1px_2px_rgb(26_22_18_/_70%)]">
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{categoryLabels[place.category]}</span>
          {distanceMeters != null && (
            <span className="ml-auto tabular-nums">
              {formatDistance(distanceMeters, distanceUnit)}
            </span>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-1">
          <h2 className="cover-title line-clamp-3 font-catalog text-2xl font-semibold leading-tight tracking-wide uppercase">
            {place.name}
          </h2>
          {sharedByOther ? (
            <p className="line-clamp-1 text-xs text-[color-mix(in_srgb,var(--parchment)_78%,transparent)]">
              Shared by {place.owner.name}
            </p>
          ) : null}
          {locality ? (
            <p className="cover-address line-clamp-1 text-xs text-[color-mix(in_srgb,var(--parchment)_78%,transparent)]">
              {locality}
            </p>
          ) : null}
          {(place.facts.cuisine || place.facts.rating != null) && (
            <p className="cover-meta text-xs text-[color-mix(in_srgb,var(--spine-gold)_90%,white)]">
              {[
                place.facts.cuisine,
                place.facts.rating != null ? `${place.facts.rating.toFixed(1)}★` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </Link>
    </article>
  )
}
