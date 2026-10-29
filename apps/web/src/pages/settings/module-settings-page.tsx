import { useCallback, useState } from "react"
import { Link, Navigate, useParams } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"
import { useMe } from "@/session"
import { SettingsCard } from "./settings-card"

/**
 * Per-module user prefs. Today: show-in-nav.
 * Later: module-owned options (home surface, enrichment hooks, PluginSettingsHost, …).
 */
export function SettingsModulePage() {
  const { moduleId: rawId } = useParams()
  const moduleId = rawId ? decodeURIComponent(rawId) : ""
  const me = useMe()
  const {
    data: modules,
    error,
    setData,
  } = useLoad(useCallback(() => api((c) => c.modules.me()), []))
  const [actionError, setActionError] = useState<string | null>(null)

  if (!moduleId) return <Navigate to="/settings/general" replace />
  if (modules && !modules.some((m) => m.id === moduleId)) {
    return <Navigate to="/settings/general" replace />
  }

  const mod = modules?.find((m) => m.id === moduleId)

  const setVisible = (visible: boolean) => {
    if (!mod) return
    setActionError(null)
    void api((c) => c.modules.setVisible({ params: { id: mod.id }, payload: { visible } })).then(
      (updated) => {
        setData((prev) => (prev ?? []).map((m) => (m.id === updated.id ? updated : m)))
      },
      (cause: unknown) => setActionError(errorMessage(cause)),
    )
  }

  const setMcpEnabled = (enabled: boolean) => {
    if (!mod) return
    setActionError(null)
    void api((c) => c.modules.setMcpEnabled({ params: { id: mod.id }, payload: { enabled } })).then(
      (updated) => {
        setData((prev) => (prev ?? []).map((m) => (m.id === updated.id ? updated : m)))
      },
      (cause: unknown) => setActionError(errorMessage(cause)),
    )
  }

  if (!mod) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          <Link to="/settings/marketplace" className="underline underline-offset-2">
            Marketplace
          </Link>
          <span aria-hidden> · </span>
          {mod.name}
        </p>
        <h2 className="font-catalog text-2xl font-semibold tracking-wide uppercase">{mod.name}</h2>
        <p className="text-sm text-muted-foreground">{mod.description}</p>
      </header>

      <ErrorAlert message={error ?? actionError} />

      <SettingsCard
        title="Show in navigation"
        description="When on, this module appears in the app nav and mobile bar for you only. Instance admins still control install/enable in Marketplace."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant={mod.visible ? "secondary" : "outline"}
            onClick={() => setVisible(!mod.visible)}
          >
            {mod.visible ? "Shown in nav" : "Hidden from nav"}
          </Button>
          {mod.visible && mod.nav[0]?.path && (
            <Button type="button" size="sm" variant="ghost" asChild>
              <Link to={mod.nav[0].path}>Open {mod.name}</Link>
            </Button>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title="MCP access"
        description="Tools this module registers for AI clients. Toggle off to hide all of them for you (not per-tool)."
      >
        {mod.mcpTools.length === 0 ? (
          <p className="text-sm text-muted-foreground">This module does not expose MCP tools.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="space-y-2 text-sm">
              {mod.mcpTools.map((tool) => (
                <li key={tool.name} className="rounded-md border border-[var(--crate-edge)] p-2">
                  <p className="font-medium">
                    {tool.title ?? tool.localName}{" "}
                    <code className="text-xs text-muted-foreground">{tool.name}</code>
                  </p>
                  <p className="text-muted-foreground">{tool.description}</p>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant={mod.mcpEnabled ? "secondary" : "outline"}
                onClick={() => setMcpEnabled(!mod.mcpEnabled)}
              >
                {mod.mcpEnabled ? "MCP allowed" : "MCP disabled"}
              </Button>
              <Link
                to="/settings/mcp"
                className="text-sm underline underline-offset-2 text-muted-foreground"
              >
                MCP settings
              </Link>
            </div>
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        title="Module options"
        description="Reserved for this plugin’s own settings (home widgets, enrichment pipelines, and similar hooks later)."
      >
        <p className="text-sm text-muted-foreground">
          {mod.name} has no extra options yet.
          {me.role === "admin" ? (
            <>
              {" "}
              Instance install and enable/disable live in the{" "}
              <Link to="/settings/marketplace" className="underline underline-offset-2">
                marketplace
              </Link>
              .
            </>
          ) : null}
        </p>
      </SettingsCard>
    </div>
  )
}

/** `/settings/modules` → Marketplace (Settings opens from each card). */
export function SettingsModulesIndexRedirect() {
  return <Navigate to="/settings/marketplace" replace />
}
