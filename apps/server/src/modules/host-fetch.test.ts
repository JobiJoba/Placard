import { createServer } from "node:http"
import { describe, expect, it } from "@effect/vitest"
import { createModuleHostFetch } from "./host-fetch.ts"

describe("plugin hostFetch", () => {
  it("reaches the internal listener when the browser uses a published Docker port", async () => {
    const server = createServer((request, response) => {
      response.setHeader("content-type", "application/json")
      response.end(
        JSON.stringify({
          path: request.url,
          cookie: request.headers.cookie,
          origin: request.headers.origin,
        }),
      )
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("Missing server port")
      const hostFetch = createModuleHostFetch(
        new Request("http://localhost:4000/api/m/places.menus/get_menus", {
          headers: { cookie: "session=test" },
        }),
        new URL("http://localhost:4000"),
        address.port,
        globalThis.fetch,
      )
      const response = await hostFetch("/api/places/manual-place?detail=true")
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        path: "/api/places/manual-place?detail=true",
        cookie: "session=test",
        origin: "http://localhost:4000",
      })
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it("routes public HTTPS callbacks internally and preserves request options", async () => {
    let received: Request | undefined
    const hostFetch = createModuleHostFetch(
      new Request("http://app:3000/api/m/example/action", { headers: { cookie: "session=test" } }),
      new URL("https://placard.example.com"),
      3000,
      async (input, init) => {
        received = new Request(input, init)
        return Response.json({ ok: true })
      },
    )
    await hostFetch("https://placard.example.com/api/search", { method: "POST", body: "{}" })
    expect(received?.url).toBe("http://127.0.0.1:3000/api/search")
    expect(received?.method).toBe("POST")
    expect(received?.headers.get("origin")).toBe("https://placard.example.com")
    expect(received?.headers.get("content-type")).toBe("application/json")
    expect(await received?.text()).toBe("{}")
  })
})
