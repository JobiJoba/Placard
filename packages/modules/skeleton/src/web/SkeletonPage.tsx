import { type CSSProperties, useCallback, useState } from "react"
import { Link } from "react-router"

const API = "/api/m/example.skeleton"

type HelloBody = {
  ok: boolean
  message: string
  ownerId: string | null
  hint: string
}

async function getHello(): Promise<HelloBody> {
  const response = await fetch(`${API}/hello`, { credentials: "include" })
  const text = await response.text()
  const body = text === "" ? undefined : JSON.parse(text)
  if (!response.ok) {
    throw new Error(body?.message ?? `Request failed (${response.status})`)
  }
  return body as HelloBody
}

const shell: CSSProperties = {
  maxWidth: "36rem",
  margin: "0 auto",
  padding: "1.5rem 1.25rem 3rem",
  fontFamily: "system-ui, sans-serif",
  lineHeight: 1.5,
}

export function SkeletonPage() {
  const [data, setData] = useState<HelloBody | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getHello())
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <main style={shell}>
      <p style={{ margin: "0 0 0.75rem" }}>
        <Link to="/">← Library</Link>
      </p>
      <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.5rem" }}>Skeleton module</h1>
      <p style={{ margin: "0 0 1.25rem", opacity: 0.8 }}>
        Minimal Marketplace starter (<code>example.skeleton</code>). Call the module HTTP API, then
        replace this page and <code>createModule()</code> with your feature.
      </p>
      <button type="button" onClick={run} disabled={loading}>
        {loading ? "Calling…" : "GET /api/m/example.skeleton/hello"}
      </button>
      {error ? (
        <p style={{ color: "#8b3a2a", marginTop: "1rem" }} role="alert">
          {error}
        </p>
      ) : null}
      {data ? (
        <pre
          style={{
            marginTop: "1rem",
            padding: "0.85rem 1rem",
            background: "#1a1612",
            color: "#f2ebe0",
            borderRadius: "0.35rem",
            overflow: "auto",
            fontSize: "0.85rem",
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : null}
    </main>
  )
}
