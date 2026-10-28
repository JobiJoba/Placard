import { type ComponentType, useEffect, useState } from "react"
import { ErrorAlert } from "@/components/error-alert"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Loads an uploaded plugin's browser ESM entry and mounts the named export.
 * Bundled modules never hit this path (they use the static registry).
 */
export function PluginPageHost({
  moduleId,
  exportName,
  webEntryUrl,
}: {
  readonly moduleId: string
  readonly exportName: string
  readonly webEntryUrl: string
}) {
  const [Page, setPage] = useState<ComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPage(null)
    setError(null)
    void import(/* @vite-ignore */ webEntryUrl)
      .then((mod: Record<string, unknown>) => {
        if (cancelled) return
        const candidate = mod[exportName] ?? (mod.default as Record<string, unknown> | undefined)?.[exportName]
        if (typeof candidate !== "function") {
          setError(`Plugin ${moduleId} does not export ${exportName}.`)
          return
        }
        setPage(() => candidate as ComponentType)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : "Could not load the plugin page.")
      })
    return () => {
      cancelled = true
    }
  }, [moduleId, exportName, webEntryUrl])

  if (error) return <ErrorAlert message={error} />
  if (!Page) return <Skeleton className="h-48 rounded-md" />
  return <Page />
}
