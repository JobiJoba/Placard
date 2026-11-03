import { readFileSync } from "node:fs"
import type { DebugLogEntry } from "@placard/domain"
import type { Schema } from "effect"
import { Effect, Logger } from "effect"

const capacity = 500
const maxMessageLength = 4_000

/** Remove common credential forms before keeping diagnostics in memory. */
export const redactLog = (message: string) =>
  message
    .replace(/(Bearer\s+)[^\s",;]+/gi, "$1[redacted]")
    .replace(
      /((?:password|secret|token|api[_-]?key|authorization|cookie)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      "$1[redacted]",
    )
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
    .replace(/(\/(?:api\/)?invites?\/)[^\s?"']+/gi, "$1[redacted]")
    .replace(/\bAIza[\w-]+/g, "[redacted]")
    .slice(0, maxMessageLength)

/** Bounded, process-local history. Never reads stdout, request bodies, or environment values. */
export class DebugLogBuffer {
  private entries: Array<Schema.Schema.Type<typeof DebugLogEntry>> = []
  private nextId = 0

  append(timestamp: string, level: string, message: string) {
    this.entries.push({ id: ++this.nextId, timestamp, level, message: redactLog(message) })
    if (this.entries.length > capacity) this.entries.shift()
  }

  snapshot() {
    return this.entries.slice().reverse()
  }
}

export const debugLogs = new DebugLogBuffer()
const startedAt = new Date(Date.now() - process.uptime() * 1_000).toISOString()
const packageVersion = (
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    version: string
  }
).version

export const DebugLoggingLive = Logger.layer(
  [
    Logger.make((options) => {
      const formatted = Logger.formatStructured.log(options)
      let message: string
      try {
        message =
          typeof formatted.message === "string"
            ? formatted.message
            : (JSON.stringify(formatted.message) ?? "")
      } catch {
        message = "[Unserializable log message]"
      }
      const method = formatted.annotations["http.method"]
      const path = formatted.annotations["http.url"]
      const status = formatted.annotations["http.status"]
      const duration = formatted.spans["http.span"]
      const request =
        typeof method === "string" && typeof path === "string"
          ? `${method} ${path.split(/[?#]/)[0]} → ${status}${duration === undefined ? "" : ` (${duration}ms)`}`
          : undefined
      const level =
        typeof status === "number" && status >= 500
          ? "ERROR"
          : typeof status === "number" && status >= 400
            ? "WARN"
            : formatted.level
      debugLogs.append(
        formatted.timestamp,
        level,
        [request, message, formatted.cause].filter(Boolean).join("\n"),
      )
    }),
  ],
  { mergeWithExisting: true },
)

export const debugView = Effect.sync(() => ({
  version: process.env.PLACARD_VERSION?.trim() || `${packageVersion} (development)`,
  revision: process.env.PLACARD_REVISION?.trim() || null,
  nodeVersion: process.version,
  startedAt,
  uptimeSeconds: Math.floor(process.uptime()),
  logCapacity: capacity,
  logs: debugLogs.snapshot(),
}))
