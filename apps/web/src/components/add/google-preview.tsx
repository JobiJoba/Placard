import type { PlacePreview } from "@placard/domain"
import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api, errorMessage } from "@/lib/api"
import { categoryIcons, categoryLabels } from "@/lib/places"
import type { PlacePageState } from "@/pages/place-page"

const alreadySaved: PlacePageState = { alreadySaved: true }

/** Autocomplete session tokens; `crypto.randomUUID` needs a secure context, this doesn't. */
export const newSessionToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** A Google place about to be saved, or a link to it when it's already saved. */
export function GooglePreviewCard({
  preview,
  source,
  sessionToken,
}: {
  readonly preview: PlacePreview
  readonly source: "autocomplete" | "map_pick"
  readonly sessionToken: string | null
}) {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const Icon = categoryIcons[preview.category]

  const save = () => {
    setSaving(true)
    setError(null)
    api((c) =>
      c.places.addFromGoogle({
        payload: { googlePlaceId: preview.googlePlaceId, source, sessionToken },
      }),
    ).then(
      ({ place, created }) =>
        navigate(`/places/${place.id}`, { state: created ? null : alreadySaved }),
      (cause: unknown) => {
        setError(errorMessage(cause))
        setSaving(false)
      },
    )
  }

  return (
    <Card aria-label="Place preview">
      <CardHeader>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5" aria-hidden /> {categoryLabels[preview.category]}
        </div>
        <CardTitle>{preview.name}</CardTitle>
        {preview.address && <CardDescription>{preview.address}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ErrorAlert message={error} />
        {preview.existingPlaceId ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">Already in your library.</span>
            <Button asChild variant="outline">
              <Link to={`/places/${preview.existingPlaceId}`} state={alreadySaved}>
                Open it
              </Link>
            </Button>
          </div>
        ) : (
          <Button className="w-fit" onClick={save} disabled={saving}>
            {saving ? "Adding…" : "Add to library"}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
