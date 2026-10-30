/** Device-local Library browse chrome: scope + grid/map only. */

export type LibraryScope = "near" | "city" | "all"
export type LibraryView = "grid" | "map"

export type LibraryBrowsePrefs = {
  readonly scope: LibraryScope
  readonly view: LibraryView
}

export const DEFAULT_LIBRARY_BROWSE_PREFS: LibraryBrowsePrefs = {
  scope: "near",
  view: "grid",
}

const STORAGE_KEY = "placard.libraryBrowse"

export function isLibraryScope(value: unknown): value is LibraryScope {
  return value === "near" || value === "city" || value === "all"
}

export function isLibraryView(value: unknown): value is LibraryView {
  return value === "grid" || value === "map"
}

export function readLibraryBrowsePrefs(): LibraryBrowsePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LIBRARY_BROWSE_PREFS
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return DEFAULT_LIBRARY_BROWSE_PREFS
    const record = parsed as Record<string, unknown>
    return {
      scope: isLibraryScope(record.scope) ? record.scope : DEFAULT_LIBRARY_BROWSE_PREFS.scope,
      view: isLibraryView(record.view) ? record.view : DEFAULT_LIBRARY_BROWSE_PREFS.view,
    }
  } catch {
    return DEFAULT_LIBRARY_BROWSE_PREFS
  }
}

export function writeLibraryBrowsePrefs(prefs: LibraryBrowsePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* private mode / unavailable storage */
  }
}
