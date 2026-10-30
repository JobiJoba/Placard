import { useEffect, useState } from "react"

export const LIBRARY_DENSITIES = [4, 5, 6] as const
export type LibraryDensity = (typeof LIBRARY_DENSITIES)[number]

export const DEFAULT_LIBRARY_DENSITY: LibraryDensity = 5

const STORAGE_KEY = "placard.libraryDensity"
const CHANGE_EVENT = "placard:library-density"

export function isLibraryDensity(value: unknown): value is LibraryDensity {
  return value === 4 || value === 5 || value === 6
}

export function readLibraryDensity(): LibraryDensity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw == null ? Number.NaN : Number(raw)
    if (isLibraryDensity(parsed)) return parsed
  } catch {
    /* private mode / unavailable storage */
  }
  return DEFAULT_LIBRARY_DENSITY
}

export function writeLibraryDensity(density: LibraryDensity): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(density))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** Device-local library card columns (4 / 5 / 6). Default 5. */
export function useLibraryDensity(): readonly [LibraryDensity, (density: LibraryDensity) => void] {
  const [density, setDensityState] = useState(readLibraryDensity)

  useEffect(() => {
    const sync = () => setDensityState(readLibraryDensity())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const setDensity = (next: LibraryDensity) => {
    writeLibraryDensity(next)
    setDensityState(next)
  }

  return [density, setDensity] as const
}
