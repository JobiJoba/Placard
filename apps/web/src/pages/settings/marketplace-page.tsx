import type { CatalogModule, InstalledModule, ModuleSource } from "@placard/domain"
import { type FormEvent, useCallback, useMemo, useState } from "react"
import { Link } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"
import { SettingsCard } from "./settings-card"

type MarketplaceCardModel = {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly description: string
  readonly source: ModuleSource
  readonly installed: boolean
  readonly enabled: boolean | null
  readonly loadError: string | null
  readonly iconUrl: string | null
  readonly coverUrl: string | null
  readonly permissions: ReadonlyArray<string>
  readonly updateAvailable: boolean
  readonly latestAvailableVersion: string | null
  readonly githubRepoUrl: string | null
}

const sourceBadge = (
  source: ModuleSource,
): { label: string; variant: "default" | "secondary" | "outline" } => {
  if (source === "bundled") return { label: "Preinstalled", variant: "default" }
  if (source === "upload") return { label: "Uploaded", variant: "secondary" }
  if (source === "github") return { label: "GitHub", variant: "secondary" }
  if (source === "folder") return { label: "Folder", variant: "outline" }
  return { label: "npm", variant: "outline" }
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

export function SettingsMarketplacePage() {
  const {
    data: catalog,
    error: catalogError,
    reload: reloadCatalog,
  } = useLoad(useCallback(() => api((c) => c.modules.catalog()), []))
  const {
    data: installed,
    error: installedError,
    reload: reloadInstalled,
    setData: setInstalled,
  } = useLoad(useCallback(() => api((c) => c.modules.installed()), []))
  const {
    data: settings,
    error: settingsError,
    setData: setSettings,
  } = useLoad(useCallback(() => api((c) => c.admin.settings()), []))
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [githubUrl, setGithubUrl] = useState("")
  const [installingGithub, setInstallingGithub] = useState(false)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [savingInterval, setSavingInterval] = useState(false)

  const refresh = () => {
    reloadCatalog()
    reloadInstalled()
  }

  const cards = useMemo((): ReadonlyArray<MarketplaceCardModel> => {
    const installedById = new Map((installed ?? []).map((m) => [m.id, m]))
    const seen = new Set<string>()
    const out: MarketplaceCardModel[] = []

    for (const mod of catalog ?? []) {
      seen.add(mod.id)
      const row = installedById.get(mod.id)
      out.push(mergeCard(mod, row))
    }
    for (const row of installed ?? []) {
      if (seen.has(row.id)) continue
      out.push({
        id: row.id,
        name: row.name,
        version: row.version,
        description: row.description,
        source: row.source,
        installed: true,
        enabled: row.enabled,
        loadError: row.loadError,
        iconUrl: row.iconUrl,
        coverUrl: row.coverUrl,
        permissions: [],
        updateAvailable: row.updateAvailable,
        latestAvailableVersion: row.latestAvailableVersion,
        githubRepoUrl: row.githubRepoUrl,
      })
    }
    return out
  }, [catalog, installed])

  const uploadZip = (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setActionError(null)
    void file
      .arrayBuffer()
      .then((buffer) => {
        const bytes = new Uint8Array(buffer)
        let binary = ""
        for (const byte of bytes) binary += String.fromCharCode(byte)
        const contentBase64 = btoa(binary)
        return api((c) => c.modules.upload({ payload: { filename: file.name, contentBase64 } }))
      })
      .then(() => {
        setUploading(false)
        refresh()
      })
      .catch((cause: unknown) => {
        setUploading(false)
        setActionError(errorMessage(cause))
      })
  }

  const installFromGithub = (event: FormEvent) => {
    event.preventDefault()
    const url = githubUrl.trim()
    if (!url) return
    setInstallingGithub(true)
    setActionError(null)
    void api((c) => c.modules.fromGithub({ payload: { url } })).then(
      () => {
        setInstallingGithub(false)
        setGithubUrl("")
        refresh()
      },
      (cause: unknown) => {
        setInstallingGithub(false)
        setActionError(errorMessage(cause))
      },
    )
  }

  const checkUpdates = () => {
    setCheckingUpdates(true)
    setActionError(null)
    void api((c) => c.modules.checkUpdates()).then(
      () => {
        setCheckingUpdates(false)
        refresh()
      },
      (cause: unknown) => {
        setCheckingUpdates(false)
        setActionError(errorMessage(cause))
      },
    )
  }

  const saveCheckInterval = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const hours = Number(new FormData(event.currentTarget).get("hours"))
    if (!Number.isInteger(hours) || hours < 0 || hours > 168) {
      setActionError("Check interval must be an integer from 0 to 168 hours.")
      return
    }
    setSavingInterval(true)
    setActionError(null)
    void api((c) => c.admin.setModuleUpdateCheckHours({ payload: { hours } })).then(
      (view) => {
        setSavingInterval(false)
        setSettings(view)
      },
      (cause: unknown) => {
        setSavingInterval(false)
        setActionError(errorMessage(cause))
      },
    )
  }

  const install = (mod: MarketplaceCardModel) => {
    setBusyId(mod.id)
    setActionError(null)
    void api((c) => c.modules.install({ payload: { moduleId: mod.id } })).then(
      () => {
        setBusyId(null)
        refresh()
      },
      (cause: unknown) => {
        setBusyId(null)
        setActionError(errorMessage(cause))
      },
    )
  }

  const updateFromGithub = (mod: MarketplaceCardModel) => {
    setBusyId(mod.id)
    setActionError(null)
    void api((c) => c.modules.updateFromGithub({ params: { id: mod.id } })).then(
      (updated) => {
        setBusyId(null)
        setInstalled((prev) => (prev ?? []).map((m) => (m.id === updated.id ? updated : m)))
        refresh()
      },
      (cause: unknown) => {
        setBusyId(null)
        setActionError(errorMessage(cause))
      },
    )
  }

  const uninstall = (mod: MarketplaceCardModel) => {
    if (!window.confirm(`Uninstall ${mod.name}? Everyone on this instance loses it.`)) return
    setBusyId(mod.id)
    setActionError(null)
    void api((c) => c.modules.uninstall({ params: { id: mod.id } })).then(
      () => {
        setBusyId(null)
        refresh()
      },
      (cause: unknown) => {
        setBusyId(null)
        setActionError(errorMessage(cause))
      },
    )
  }

  const setEnabled = (mod: MarketplaceCardModel, enabled: boolean) => {
    setBusyId(mod.id)
    setActionError(null)
    void api((c) => c.modules.setEnabled({ params: { id: mod.id }, payload: { enabled } })).then(
      (updated) => {
        setBusyId(null)
        setInstalled((prev) => (prev ?? []).map((m) => (m.id === updated.id ? updated : m)))
      },
      (cause: unknown) => {
        setBusyId(null)
        setActionError(errorMessage(cause))
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard
        title="Module marketplace"
        description="Trusted plugins for this instance. Preinstalled modules ship with Placard; upload a zip or install from a public GitHub Release. Disable is the kill switch (a restart may be needed to fully unload)."
      >
        <ErrorAlert message={catalogError ?? installedError ?? settingsError ?? actionError} />

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-[var(--crate-edge)] bg-[color-mix(in_srgb,var(--crate)_6%,transparent)] p-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">Upload prebuilt plugin</p>
            <p className="text-xs text-muted-foreground">
              Zip with placard.module.json + server/ + web/ (optional cover/icon assets).
            </p>
          </div>
          <Button type="button" size="sm" disabled={uploading} asChild>
            <label>
              {uploading ? "Uploading…" : "Choose .zip"}
              <input
                type="file"
                accept=".zip,application/zip,.placard-module"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  uploadZip(e.target.files?.[0])
                  e.target.value = ""
                }}
              />
            </label>
          </Button>
        </div>

        <form
          onSubmit={installFromGithub}
          className="mb-4 rounded-md border border-[var(--crate-edge)] bg-[color-mix(in_srgb,var(--crate)_6%,transparent)] p-3"
        >
          <FieldGroup>
            <div>
              <p className="font-medium">Install from GitHub</p>
              <p className="text-xs text-muted-foreground">
                Public repo URL or owner/repo. Installs the latest Release asset (.placard-module or
                .zip).
              </p>
            </div>
            <Field>
              <FieldLabel htmlFor="githubRepoUrl">Repository</FieldLabel>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="githubRepoUrl"
                  name="githubRepoUrl"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  spellCheck={false}
                  autoComplete="off"
                  className="min-w-[16rem] flex-1"
                />
                <Button type="submit" size="sm" disabled={installingGithub || !githubUrl.trim()}>
                  {installingGithub ? "Installing…" : "Install"}
                </Button>
              </div>
            </Field>
          </FieldGroup>
        </form>

        <form
          onSubmit={saveCheckInterval}
          className="mb-6 flex flex-wrap items-end gap-3 rounded-md border border-[var(--crate-edge)] p-3"
        >
          <Field className="min-w-[10rem] flex-1">
            <FieldLabel htmlFor="moduleUpdateCheckHours">Update check interval (hours)</FieldLabel>
            <Input
              id="moduleUpdateCheckHours"
              name="hours"
              type="number"
              min={0}
              max={168}
              step={1}
              key={settings?.moduleUpdateCheckHours ?? "loading"}
              defaultValue={settings?.moduleUpdateCheckHours ?? 24}
            />
            <FieldDescription>0 disables automatic checks. Default is 24.</FieldDescription>
          </Field>
          <Button type="submit" size="sm" variant="outline" disabled={savingInterval || !settings}>
            {savingInterval ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={checkingUpdates}
            onClick={checkUpdates}
          >
            {checkingUpdates ? "Checking…" : "Check now"}
          </Button>
        </form>

        {!catalog || !installed ? (
          <p className="text-sm text-muted-foreground">Loading modules…</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No modules in the catalog yet.</p>
        ) : (
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">
            {cards.map((mod) => (
              <li key={mod.id}>
                <ModuleCard
                  mod={mod}
                  busy={busyId === mod.id}
                  onInstall={() => install(mod)}
                  onUpdate={() => updateFromGithub(mod)}
                  onUninstall={() => uninstall(mod)}
                  onSetEnabled={(enabled) => setEnabled(mod, enabled)}
                />
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
    </div>
  )
}

const mergeCard = (mod: CatalogModule, row: InstalledModule | undefined): MarketplaceCardModel => ({
  id: mod.id,
  name: mod.name,
  version: row?.version ?? mod.version,
  description: mod.description,
  source: row?.source ?? mod.source,
  installed: Boolean(row) || mod.installed,
  enabled: row ? row.enabled : null,
  loadError: row?.loadError ?? null,
  iconUrl: row?.iconUrl ?? mod.iconUrl,
  coverUrl: row?.coverUrl ?? mod.coverUrl,
  permissions: mod.permissions,
  updateAvailable: row?.updateAvailable ?? false,
  latestAvailableVersion: row?.latestAvailableVersion ?? null,
  githubRepoUrl: row?.githubRepoUrl ?? null,
})

function ModuleCard({
  mod,
  busy,
  onInstall,
  onUpdate,
  onUninstall,
  onSetEnabled,
}: {
  readonly mod: MarketplaceCardModel
  readonly busy: boolean
  readonly onInstall: () => void
  readonly onUpdate: () => void
  readonly onUninstall: () => void
  readonly onSetEnabled: (enabled: boolean) => void
}) {
  const badge = sourceBadge(mod.source)
  const status = !mod.installed ? "Not installed" : mod.enabled ? "Enabled" : "Disabled"

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-md border border-[var(--crate-edge)] bg-card shadow-[0_12px_28px_-24px_rgb(26_22_18_/_55%)]">
      <div className="relative aspect-[16/9] overflow-hidden bg-[var(--crate)]">
        {mod.coverUrl ? (
          <img src={mod.coverUrl} alt="" className="size-full object-cover" />
        ) : (
          <div
            className="flex size-full items-center justify-center"
            style={{
              background:
                "linear-gradient(160deg, #8b3a2a 0%, color-mix(in srgb, var(--crate) 55%, #8b3a2a) 55%, var(--crate) 100%)",
            }}
            aria-hidden
          >
            <span className="font-catalog text-4xl tracking-[0.14em] text-[var(--parchment)] uppercase">
              {initials(mod.name) || "·"}
            </span>
          </div>
        )}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {mod.updateAvailable ? <Badge variant="default">Update available</Badge> : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          {mod.iconUrl && mod.iconUrl !== mod.coverUrl ? (
            <img
              src={mod.iconUrl}
              alt=""
              className="size-10 shrink-0 rounded-sm border border-[var(--crate-edge)] object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="font-catalog text-xl font-semibold tracking-wide uppercase">
              {mod.name}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{mod.description}</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {mod.version} · {status}
          {mod.updateAvailable && mod.latestAvailableVersion
            ? ` · ${mod.latestAvailableVersion} available`
            : ""}
          {mod.loadError ? ` · ${mod.loadError}` : ""}
        </p>
        {mod.githubRepoUrl ? (
          <a
            href={mod.githubRepoUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline underline-offset-2"
          >
            {mod.githubRepoUrl.replace(/^https:\/\/github\.com\//, "")}
          </a>
        ) : null}

        <div className="mt-auto flex flex-wrap gap-2 border-t border-[var(--crate-edge)] pt-3">
          {!mod.installed ? (
            <Button
              type="button"
              size="sm"
              disabled={busy || mod.source !== "bundled"}
              onClick={onInstall}
            >
              Install
            </Button>
          ) : (
            <>
              {mod.source === "github" && mod.updateAvailable ? (
                <Button type="button" size="sm" disabled={busy} onClick={onUpdate}>
                  Update
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="secondary" asChild>
                <Link to={`/settings/modules/${encodeURIComponent(mod.id)}`}>Settings</Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onSetEnabled(!(mod.enabled ?? false))}
              >
                {mod.enabled ? "Disable" : "Enable"}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onUninstall}>
                Uninstall
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  )
}
