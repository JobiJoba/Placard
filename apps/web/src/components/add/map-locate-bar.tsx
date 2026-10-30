import { LocateFixed } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Status + recovery for add-map geolocation (Custom pin and Google Map tabs). */
export function MapLocateBar({
  locating,
  message,
  onLocate,
}: {
  readonly locating: boolean
  readonly message: string | null
  readonly onLocate: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      {!locating && message ? (
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{message}</p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onLocate}
        disabled={locating}
        className="gap-1.5"
        aria-busy={locating}
      >
        <LocateFixed className="size-3.5" aria-hidden />
        {locating ? "Finding your location…" : "Use my location"}
      </Button>
    </div>
  )
}
