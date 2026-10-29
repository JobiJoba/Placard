import { Context, Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import type { SqlClient } from "effect/sql"
import { AppConfig } from "../../src/config.ts"
import type { Database } from "../../src/db/database.ts"
import { runMigrations } from "../../src/db/migrate.ts"
import { GoogleFixtureClient } from "../../src/google/fixture-client.ts"
import type { Health } from "../../src/health.ts"
import { RoutesLive } from "../../src/http/api.ts"
import { IntegrationLayer } from "./postgis.ts"

export interface JsonResponse {
  readonly status: number
  // biome-ignore lint/suspicious/noExplicitAny: tests assert on response bodies structurally
  readonly body: any
}

export interface RawResponse {
  readonly status: number
  readonly body: Uint8Array
  readonly contentType: string | null
}

/** A browser-like client: keeps its own cookies and sends the app's Origin. */
export interface Browser {
  readonly get: (path: string) => Promise<JsonResponse>
  readonly getRaw: (path: string) => Promise<RawResponse>
  readonly send: (method: string, path: string, body?: unknown) => Promise<JsonResponse>
}

export interface TestAppService {
  readonly browser: () => Browser
  /** Absolute-URL fetch against the in-process router (for MCP SDK clients). */
  readonly fetch: typeof globalThis.fetch
  readonly publicUrl: URL
}

/** The full `/api` router running in-process against the test database. */
export class TestApp extends Context.Service<TestApp, TestAppService>()("test/TestApp") {
  static readonly layer = Layer.effect(
    TestApp,
    Effect.gen(function* () {
      yield* runMigrations
      const config = yield* AppConfig
      const services = yield* Effect.context<SqlClient.SqlClient | AppConfig | Health | Database>()
      const app = HttpRouter.toWebHandler(
        RoutesLive.pipe(
          Layer.provide(GoogleFixtureClient),
          Layer.provide(Layer.succeedContext(services)),
          Layer.provide(HttpServer.layerServices),
        ),
        { disableLogger: true },
      )
      yield* Effect.addFinalizer(() => Effect.promise(() => app.dispose()))

      const fetchImpl: typeof globalThis.fetch = async (input, init) => {
        const url =
          typeof input === "string"
            ? new URL(input, config.publicUrl)
            : input instanceof URL
              ? input
              : new URL(input.url)
        const headers = new Headers(init?.headers)
        if (!headers.has("origin")) headers.set("origin", config.publicUrl.origin)
        const requestInit: RequestInit = { headers }
        if (init?.method !== undefined) requestInit.method = init.method
        if (init?.body !== undefined) requestInit.body = init.body
        return app.handler(new Request(url, requestInit), services)
      }

      const browser = (): Browser => {
        const cookies = new Map<string, string>()
        const request = async (method: string, path: string, body?: unknown) => {
          const headers = new Headers({ origin: config.publicUrl.origin })
          if (cookies.size > 0) {
            headers.set("cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "))
          }
          if (body !== undefined) headers.set("content-type", "application/json")
          const response = await app.handler(
            new Request(new URL(path, config.publicUrl), {
              method,
              headers,
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            }),
            services,
          )
          for (const setCookie of response.headers.getSetCookie()) {
            const [pair = ""] = setCookie.split(";")
            const index = pair.indexOf("=")
            const name = pair.slice(0, index)
            const value = pair.slice(index + 1)
            if (value === "" || /max-age=0/i.test(setCookie)) cookies.delete(name)
            else cookies.set(name, value)
          }
          return response
        }
        const send = async (method: string, path: string, body?: unknown) => {
          const response = await request(method, path, body)
          const text = await response.text()
          return { status: response.status, body: text === "" ? undefined : JSON.parse(text) }
        }
        return {
          get: (path) => send("GET", path),
          getRaw: async (path) => {
            const response = await request("GET", path)
            return {
              status: response.status,
              body: new Uint8Array(await response.arrayBuffer()),
              contentType: response.headers.get("content-type"),
            }
          },
          send,
        }
      }

      return { browser, fetch: fetchImpl, publicUrl: config.publicUrl }
    }),
  ).pipe(Layer.provideMerge(IntegrationLayer))
}
