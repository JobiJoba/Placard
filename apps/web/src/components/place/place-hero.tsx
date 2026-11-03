import type { Place } from "@placard/domain"
import { Badge } from "@/components/ui/badge"
import { type categoryIcon, categoryLabel, categoryTone, statusLabels } from "@/lib/places"

export function PlaceHero({
  place,
  Icon,
}: {
  readonly place: Place
  readonly Icon: ReturnType<typeof categoryIcon>
}) {
  const coverSrc = place.coverThumbUrl
  return (
    <header className="relative h-52 w-full overflow-hidden rounded-sm bg-[var(--crate)] text-[var(--parchment)] sm:h-60 md:h-64">
      {coverSrc ? (
        <>
          <img
            src={coverSrc}
            alt=""
            className="absolute inset-0 size-full object-cover"
            loading="eager"
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: [
                "linear-gradient(to top, var(--crate) 0%, color-mix(in srgb, var(--crate) 55%, transparent) 42%, transparent 68%)",
                "linear-gradient(to bottom, color-mix(in srgb, var(--crate) 70%, transparent) 0%, transparent 36%)",
              ].join(", "),
            }}
            aria-hidden
          />
        </>
      ) : (
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background: `linear-gradient(160deg, ${categoryTone(place.category)} 0%, color-mix(in srgb, var(--crate) 55%, ${categoryTone(place.category)}) 55%, var(--crate) 100%)`,
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
      <div className="relative z-[1] flex h-full flex-col justify-between gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            className="w-fit gap-1.5 border-0 bg-[color-mix(in_srgb,var(--crate)_55%,transparent)] text-[var(--parchment)]"
          >
            <Icon aria-hidden className="size-3.5" /> {categoryLabel(place.category)}
          </Badge>
          {place.status ? (
            <Badge
              variant="outline"
              className="border-[color-mix(in_srgb,var(--parchment)_35%,transparent)] bg-[color-mix(in_srgb,var(--crate)_40%,transparent)] text-[var(--parchment)]"
            >
              {statusLabels[place.status]}
            </Badge>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-col gap-1.5">
          <h1 className="font-catalog text-3xl font-semibold leading-tight tracking-wide uppercase sm:text-4xl">
            {place.name}
          </h1>
          {place.address ? (
            <p className="max-w-prose text-sm text-[color-mix(in_srgb,var(--parchment)_78%,transparent)] sm:text-base">
              {place.address}
            </p>
          ) : null}
          {place.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {place.tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="border-0 bg-[color-mix(in_srgb,var(--parchment)_18%,transparent)] text-[var(--parchment)]"
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
