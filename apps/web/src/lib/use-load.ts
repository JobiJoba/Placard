import { useCallback, useEffect, useRef, useState } from "react"
import { errorMessage } from "@/lib/api"

/** Loads data on mount and whenever `load` changes; keep `load` stable. */
export function useLoad<A>(load: () => Promise<A>) {
  const [data, setData] = useState<A | null>(null)
  const [failure, setFailure] = useState<{ readonly cause: unknown } | null>(null)
  const generation = useRef(0)
  const reload = useCallback(() => {
    const request = ++generation.current
    load().then(
      (value) => {
        if (request !== generation.current) return
        setData(value)
        setFailure(null)
      },
      (cause: unknown) => {
        if (request === generation.current) setFailure({ cause })
      },
    )
  }, [load])
  useEffect(() => {
    reload()
    // Ignore pending responses after a dependency change or unmount.
    return () => {
      generation.current++
    }
  }, [reload])
  const error = failure ? errorMessage(failure.cause) : null
  return { data, setData, error, cause: failure?.cause, reload }
}
