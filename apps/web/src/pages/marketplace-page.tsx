import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"
import { useModules } from "@/modules"
import { useMe } from "@/session"

export function MarketplaceInvitation() {
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void fetch("/api/marketplace/welcome")
      .then((r) => r.json())
      .then((v) => setShow(v.show))
      .catch(() => {})
  }, [])
  const dismiss = async () => {
    try {
      const response = await fetch("/api/marketplace/welcome", { method: "POST" })
      if (!response.ok) throw new Error("Could not save your preference. Try again.")
      setShow(false)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }
  if (!show) return null
  return (
    <aside className="mb-6 rounded-lg border bg-card p-5">
      <h2 className="font-catalog text-xl">More ways to enjoy your places</h2>
      <p className="my-2 text-sm text-muted-foreground">
        Plan a day out, choose tonight’s spot, or make something with your collection.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link to="/marketplace" onClick={() => void dismiss()}>
            Explore plugins
          </Link>
        </Button>
        <Button variant="ghost" onClick={() => void dismiss()}>
          Maybe later
        </Button>
      </div>
      <ErrorAlert message={error} />
    </aside>
  )
}

export function MarketplacePage() {
  const me = useMe()
  const { data: mine, reload } = useModules()
  const { data: catalog, error } = useLoad(useCallback(() => api((c) => c.modules.catalog()), []))
  const { data: installed, reload: reloadInstalled } = useLoad(
    useCallback(() => api((c) => c.modules.installed()), []),
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  async function activate(id: string, enabled: boolean) {
    setBusy(id)
    setActionError(null)
    try {
      await api((c) => c.modules.setEnabled({ params: { id }, payload: { enabled } }))
      reload()
      reloadInstalled()
    } catch (cause) {
      setActionError(errorMessage(cause))
      reloadInstalled()
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-catalog text-3xl">Marketplace</h1>
          <p className="mt-2 text-muted-foreground">Find new ways to enjoy the places you keep.</p>
        </div>
        {me.role === "admin" && (
          <Button variant="outline" asChild>
            <Link to="/settings/manage-plugins">Manage plugins</Link>
          </Button>
        )}
      </div>
      <ErrorAlert message={error ?? actionError} />
      {!catalog || !installed ? (
        <p>Loading plugins…</p>
      ) : (
        <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.map((plugin) => {
            const row = installed.find((item) => item.id === plugin.id)
            const personal = mine?.find((item) => item.id === plugin.id)
            const path = personal?.visible ? personal.nav[0]?.path : undefined
            return (
              <li
                key={plugin.id}
                className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm"
              >
                {plugin.coverUrl || plugin.iconUrl ? (
                  <img
                    src={plugin.coverUrl ?? plugin.iconUrl ?? ""}
                    alt=""
                    className="aspect-video w-full bg-muted object-contain"
                  />
                ) : null}
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <h2 className="font-catalog text-2xl">{plugin.name}</h2>
                  <p className="text-sm text-muted-foreground">{plugin.description}</p>
                  {plugin.source === "bundled" && plugin.id !== "places.decide-together" && (
                    <details>
                      <summary className="cursor-pointer text-sm underline underline-offset-4">
                        Preview
                      </summary>
                      <img
                        loading="lazy"
                        src={`/api/modules/${encodeURIComponent(plugin.id)}/assets/web/assets/preview.png`}
                        alt={`${plugin.name} preview`}
                        className="mt-3 w-full rounded border"
                      />
                    </details>
                  )}
                  {row?.loadError && (
                    <p role="alert" className="text-sm text-destructive">
                      {row.loadError}
                    </p>
                  )}
                  <div className="mt-auto flex flex-col gap-2 pt-3">
                    {row?.enabled ? (
                      <>
                        {path ? (
                          <Button asChild>
                            <Link to={path}>Open {plugin.name}</Link>
                          </Button>
                        ) : (
                          <p className="text-sm">
                            {personal && !personal.visible
                              ? "Hidden in your personal plugin preferences."
                              : plugin.id === "places.menus"
                                ? "Find Menus on your restaurant, café and bar cards."
                                : "Active for this instance."}
                          </p>
                        )}
                        {me.role === "admin" && (
                          <Button
                            variant="ghost"
                            disabled={busy !== null}
                            onClick={() => void activate(plugin.id, false)}
                          >
                            Deactivate
                          </Button>
                        )}
                      </>
                    ) : me.role === "admin" ? (
                      <>
                        <Button
                          disabled={busy !== null}
                          onClick={() => void activate(plugin.id, true)}
                        >
                          {busy === plugin.id
                            ? "Activating…"
                            : row?.loadError
                              ? "Retry activation"
                              : "Activate"}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Activates for everyone on this instance.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Ask an admin to activate</p>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
