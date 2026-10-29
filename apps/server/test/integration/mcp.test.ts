import { expect, layer } from "@effect/vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { Effect } from "effect"
import { type Browser, TestApp } from "../layers/app.ts"

const password = "correct horse battery"

const signUp = (browser: Browser, name: string, email: string) =>
  browser.send("POST", "/api/auth/sign-up/email", { name, email, password })

const run = <A>(f: (app: TestApp["Service"]) => Promise<A>) =>
  Effect.gen(function* () {
    const app = yield* TestApp
    return yield* Effect.promise(() => f(app))
  })

const mcpFetch =
  (app: TestApp["Service"], secret: string | null): typeof fetch =>
  (input, init) => {
    const headers = new Headers(init?.headers)
    if (secret) headers.set("authorization", `Bearer ${secret}`)
    return app.fetch(input, { ...init, headers })
  }

layer(TestApp.layer, { concurrent: false, timeout: 120_000 })("mcp", (it) => {
  const admin = { browser: undefined as unknown as Browser }
  let secret = ""
  let placeId = ""
  let listId = ""

  it.effect("token CRUD and MCP status", () =>
    run(async (app) => {
      admin.browser = app.browser()
      expect((await signUp(admin.browser, "Ada", "ada@example.com")).status).toBe(200)

      const status = await admin.browser.get("/api/mcp/status")
      expect(status.status).toBe(200)
      expect(status.body).toMatchObject({ enabled: true })
      expect(status.body.endpoint).toBe(new URL("/mcp", app.publicUrl).href)

      const created = await admin.browser.send("POST", "/api/tokens", { name: "Cursor" })
      expect(created.status).toBe(200)
      expect(created.body.secret).toMatch(/^plc_/)
      expect(created.body.token.name).toBe("Cursor")
      secret = created.body.secret

      const listed = await admin.browser.get("/api/tokens")
      expect(listed.body).toEqual([
        expect.objectContaining({ id: created.body.token.id, name: "Cursor", revokedAt: null }),
      ])
    }),
  )

  it.effect("/mcp rejects missing and revoked tokens", () =>
    run(async (app) => {
      const denied = await app.fetch(new URL("/mcp", app.publicUrl), {
        method: "POST",
        headers: { "content-type": "application/json", origin: app.publicUrl.origin },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "t", version: "0" },
          },
        }),
      })
      expect(denied.status).toBe(401)

      const listed = await admin.browser.get("/api/tokens")
      const id = listed.body[0].id as string
      expect((await admin.browser.send("DELETE", `/api/tokens/${id}`)).status).toBe(200)

      const revoked = await app.fetch(new URL("/mcp", app.publicUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: app.publicUrl.origin,
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "t", version: "0" },
          },
        }),
      })
      expect(revoked.status).toBe(401)

      const again = await admin.browser.send("POST", "/api/tokens", { name: "tools" })
      expect(again.status).toBe(200)
      secret = again.body.secret
    }),
  )

  it.effect("seed place + list", () =>
    run(async () => {
      const pin = await admin.browser.send("POST", "/api/places/manual", {
        name: "Da Michele",
        category: "restaurant",
        location: { lat: 40.85, lng: 14.26 },
        address: "Napoli",
      })
      expect(pin.status).toBe(200)
      placeId = pin.body.place.id

      const list = await admin.browser.send("POST", "/api/lists", {
        name: "Italian",
        description: null,
      })
      expect(list.status).toBe(200)
      listId = list.body.id
    }),
  )

  it.effect("MCP SDK client lists tools and calls search / add_to_list / set_status", () =>
    run(async (app) => {
      const transport = new StreamableHTTPClientTransport(new URL("/mcp", app.publicUrl), {
        fetch: mcpFetch(app, secret),
      })
      const client = new Client({ name: "placard-test", version: "0.0.0" })
      await client.connect(transport)

      const tools = await client.listTools()
      const names = tools.tools.map((t) => t.name).sort()
      expect(names).toContain("restaurants_decide__decide_restaurant")
      expect(names).toEqual(
        [
          "add_to_list",
          "create_place",
          "get_place",
          "list_lists",
          "restaurants_decide__decide_restaurant",
          "search_places",
          "set_status",
        ].sort(),
      )

      const search = await client.callTool({
        name: "search_places",
        arguments: { text: "Michele", category: "restaurant" },
      })
      expect(search.isError).toBeFalsy()
      const searchText = (search.content as { type: string; text: string }[])[0]?.text ?? ""
      expect(searchText).toContain("Da Michele")

      const add = await client.callTool({
        name: "add_to_list",
        arguments: { placeId, listId },
      })
      expect(add.isError).toBeFalsy()

      const status = await client.callTool({
        name: "set_status",
        arguments: { placeId, status: "want_to_go" },
      })
      expect(status.isError).toBeFalsy()

      const got = await client.callTool({ name: "get_place", arguments: { id: placeId } })
      expect(got.isError).toBeFalsy()
      expect((got.content as { text: string }[])[0]?.text).toContain("want_to_go")

      const decided = await client.callTool({
        name: "restaurants_decide__decide_restaurant",
        arguments: { avoidRecent: false },
      })
      expect(decided.isError).toBeFalsy()

      await client.close()
    }),
  )

  it.effect("disabling module MCP hides restaurants_decide__decide_restaurant", () =>
    run(async (app) => {
      const off = await admin.browser.send("PATCH", "/api/modules/me/restaurants.decide/mcp", {
        enabled: false,
      })
      expect(off.status).toBe(200)
      expect(off.body.mcpEnabled).toBe(false)

      const transport = new StreamableHTTPClientTransport(new URL("/mcp", app.publicUrl), {
        fetch: mcpFetch(app, secret),
      })
      const client = new Client({ name: "placard-test", version: "0.0.0" })
      await client.connect(transport)
      const tools = await client.listTools()
      expect(tools.tools.map((t) => t.name)).not.toContain("restaurants_decide__decide_restaurant")
      await client.close()

      await admin.browser.send("PATCH", "/api/modules/me/restaurants.decide/mcp", {
        enabled: true,
      })
    }),
  )

  it.effect("user isolation: another user's token cannot see the place", () =>
    run(async (app) => {
      const invite = await admin.browser.send("POST", "/api/admin/invites", {
        email: "bob@example.com",
      })
      expect(invite.status).toBe(200)
      const token = new URL(invite.body.url).pathname.split("/").pop() as string
      const member = app.browser()
      expect(
        (
          await member.send("POST", "/api/auth/sign-up/email", {
            name: "Bob",
            email: "bob@example.com",
            password,
            inviteToken: token,
          })
        ).status,
      ).toBe(200)

      const memberTok = await member.send("POST", "/api/tokens", { name: "bob" })
      expect(memberTok.status).toBe(200)

      const transport = new StreamableHTTPClientTransport(new URL("/mcp", app.publicUrl), {
        fetch: mcpFetch(app, memberTok.body.secret),
      })
      const client = new Client({ name: "bob-client", version: "0.0.0" })
      await client.connect(transport)
      const got = await client.callTool({ name: "get_place", arguments: { id: placeId } })
      expect(got.isError).toBe(true)
      await client.close()
    }),
  )
})
