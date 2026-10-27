import { useCallback, useEffect, useState } from "react"
import { errorMessage } from "@/lib/api"

/** Loads data on mount and whenever `load` changes; keep `load` stable. */
export function useLoad<A>(load: () => Promise<A>) {
  const [data, setData] = useState<A | null>(null)
  const [failure, setFailure] = useState<{ readonly cause: unknown } | null>(null)
  const reload = useCallback(() => {
    load().then(
      (value) => {
        setData(value)
        setFailure(null)
      },
      (cause: unknown) => setFailure({ cause }),
    )
  }, [load])
  useEffect(reload, [reload])
  const error = failure ? errorMessage(failure.cause) : null
  return { data, setData, error, cause: failure?.cause, reload }
}
