import type { ApiToken, CreatedToken, McpStatus, MyModule } from "@placard/domain"
import { DateTime } from "effect"
import { useCallback, useState } from "react"
import { Link } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"
import { SettingsCard } from "./settings-card"

export function SettingsMcpPage() {
  const { data: status, error: statusError } = useLoad(
    useCallback(() => api((c) => c.mcp.status()), []),
  )
  const {
    data: tokens,
    error: tokensError,
    setData: setTokens,
    reload: reloadTokens,
  } = useLoad(useCallback(() => api((c) => c.tokens.list()), []))
  const {
    data: modules,
    error: modulesError,
    setData: setModules,
  } = useLoad(useCallback(() => api((c) => c.modules.me()), []))
  const [name, setName] = useState("Cursor")
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedToken | null>(null)

  const moduleTools = (modules ?? []).filter((m) => m.mcpTools.length > 0)

  const setModuleMcp = (mod: MyModule, enabled: boolean) => {
    setActionError(null)
    void api((c) =>
      c.modules.setMcpEnabled({ params: { id: mod.id }, payload: { enabled } }),
    ).then(
      (updated) => {
        setModules((prev) => (prev ?? []).map((m) => (m.id === updated.id ? updated : m)))
      },
      (cause: unknown) => setActionError(errorMessage(cause)),
    )
  }

  const create = () => {
    setBusy(true)
    setActionError(null)
    setCreated(null)
    void api((c) => c.tokens.create({ payload: { name: name.trim() || "MCP token" } })).then(
      (result) => {
        setBusy(false)
        setCreated(result)
        setTokens((prev) => [result.token, ...(prev ?? [])])
        setName("")
      },
      (cause: unknown) => {
        setBusy(false)
        setActionError(errorMessage(cause))
      },
    )
  }

  const revoke = (token: ApiToken) => {
    if (!window.confirm(`Revoke “${token.name}”? Clients using it will be refused.`)) return
    setActionError(null)
    void api((c) => c.tokens.revoke({ params: { id: token.id } })).then(
      () => reloadTokens(),
      (cause: unknown) => setActionError(errorMessage(cause)),
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <ConnectCard status={status} />
      <SettingsCard
        title="Personal access tokens"
        description="Tokens authenticate MCP clients as you. Anyone with a token can read and change your library — treat them like passwords."
      >
        <ErrorAlert message={statusError ?? tokensError ?? actionError} />
        {created && (
          <div className="mb-4 rounded-md border border-[var(--crate-edge)] bg-[color-mix(in_srgb,var(--crate)_8%,transparent)] p-3">
            <p className="text-sm font-medium">Copy this token now — it won’t be shown again.</p>
            <code className="mt-2 block break-all rounded bg-muted px-2 py-1.5 text-xs">
              {created.secret}
            </code>
            <Button
              type="button"
              size="sm"
              className="mt-2"
              onClick={() => void navigator.clipboard.writeText(created.secret)}
            >
              Copy token
            </Button>
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <Field className="min-w-[12rem] flex-1">
            <FieldLabel htmlFor="token-name">Name</FieldLabel>
            <Input
              id="token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cursor on laptop"
            />
          </Field>
          <Button
            type="button"
            size="sm"
            disabled={busy || status?.enabled === false}
            onClick={create}
          >
            {busy ? "Creating…" : "Create token"}
          </Button>
        </div>
        {!tokens ? (
          <p className="text-sm text-muted-foreground">Loading tokens…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tokens yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--crate-edge)]">
            {tokens.map((token) => (
              <li key={token.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{token.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Created {formatWhen(token.createdAt)}
                    {token.lastUsedAt ? ` · Last used ${formatWhen(token.lastUsedAt)}` : ""}
                    {token.revokedAt ? " · Revoked" : ""}
                  </p>
                </div>
                {!token.revokedAt && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => revoke(token)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
      <SettingsCard
        title="Module tools"
        description="Plugins can register MCP tools. Disable a module here to hide all of its tools for you."
      >
        <ErrorAlert message={modulesError} />
        {moduleTools.length === 0 ? (
          <p className="text-sm text-muted-foreground">No installed modules expose MCP tools.</p>
        ) : (
          <ul className="divide-y divide-[var(--crate-edge)]">
            {moduleTools.map((mod) => (
              <li key={mod.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{mod.name}</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {mod.mcpTools.map((tool) => (
                      <li key={tool.name}>
                        <code>{tool.name}</code>
                        {tool.title ? ` — ${tool.title}` : ""}
                        {tool.localName !== tool.name ? (
                          <span className="text-muted-foreground"> ({tool.localName})</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={mod.mcpEnabled ? "secondary" : "outline"}
                    onClick={() => setModuleMcp(mod, !mod.mcpEnabled)}
                  >
                    {mod.mcpEnabled ? "Allowed" : "Disabled"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" asChild>
                    <Link to={`/settings/modules/${encodeURIComponent(mod.id)}`}>Settings</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
      {status && <SnippetsCard status={status} />}
    </div>
  )
}

function ConnectCard({ status }: { readonly status: McpStatus | null | undefined }) {
  return (
    <SettingsCard
      title="Connect MCP"
      description="Talk to your library from Cursor, Claude, or any MCP client over Streamable HTTP."
    >
      {!status ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !status.enabled ? (
        <p className="text-sm text-muted-foreground">
          MCP is turned off on this instance (`MCP_ENABLED=false`). Ask the admin to enable it.
        </p>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Endpoint:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{status.endpoint}</code>
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Create a personal access token below.</li>
            <li>Paste the endpoint and token into your client config.</li>
            <li>Ask the agent to search places, add to a list, or decide dinner.</li>
          </ol>
        </div>
      )}
    </SettingsCard>
  )
}

function SnippetsCard({ status }: { readonly status: McpStatus }) {
  const cursorSnippet = `{
  "mcpServers": {
    "placard": {
      "url": ${JSON.stringify(status.endpoint)},
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}`

  const claudeSnippet = `{
  "mcpServers": {
    "placard": {
      "type": "http",
      "url": ${JSON.stringify(status.endpoint)},
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}`

  return (
    <SettingsCard
      title="Client snippets"
      description="Replace YOUR_TOKEN_HERE with a token you create above. Restart the client after saving."
    >
      <div className="flex flex-col gap-4">
        <Snippet title="Cursor (mcp.json)" body={cursorSnippet} />
        <Snippet title="Claude Desktop / Claude Code" body={claudeSnippet} />
      </div>
    </SettingsCard>
  )
}

function Snippet({ title, body }: { readonly title: string; readonly body: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void navigator.clipboard.writeText(body)}
        >
          Copy
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{body}</pre>
    </div>
  )
}

const formatWhen = (value: DateTime.Utc) =>
  DateTime.formatLocal(value, { dateStyle: "medium", timeStyle: "short" })
