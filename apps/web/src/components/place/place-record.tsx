import type { Place, PlaceList } from "@placard/domain"
import { Badge } from "@/components/ui/badge"

export function PlaceRecordSection({
  place,
  membershipLists,
}: {
  readonly place: Place
  readonly membershipLists: ReadonlyArray<PlaceList>
}) {
  const hasNotes = Boolean(place.notes?.trim())
  const hasLists = membershipLists.length > 0
  if (!hasNotes && !hasLists) return null

  return (
    <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="place-record-heading">
      <h2 id="place-record-heading" className="text-lg font-medium">
        In your library
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        {hasNotes ? (
          <>
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="whitespace-pre-wrap">{place.notes}</dd>
          </>
        ) : null}
        {hasLists ? (
          <>
            <dt className="text-muted-foreground">Lists</dt>
            <dd className="flex flex-wrap gap-1">
              {membershipLists.map((list) => (
                <Badge key={list.id} variant="secondary">
                  {list.name}
                </Badge>
              ))}
            </dd>
          </>
        ) : null}
      </dl>
    </section>
  )
}
