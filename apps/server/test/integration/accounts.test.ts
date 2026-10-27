import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { type Browser, TestApp } from "../layers/app.ts"

const password = "correct horse battery"

const signUp = (browser: Browser, name: string, email: string, inviteToken?: string) =>
  browser.send("POST", "/api/auth/sign-up/email", { name, email, password, inviteToken })

const inviteTokenFrom = (url: string) => new URL(url).pathname.split("/").pop() as string

const run = <A>(f: (app: TestApp["Service"]) => Promise<A>) =>
  Effect.gen(function* () {
    const app = yield* TestApp
    return yield* Effect.promise(() => f(app))
  })

layer(TestApp.layer, { concurrent: false, timeout: 120_000 })("accounts", (it) => {
  const admin = { browser: undefined as unknown as Browser }
  const member = { browser: undefined as unknown as Browser }
  let memberInviteUrl = ""

  it.effect("a fresh install has signup open and no session", () =>
    run(async (app) => {
      const visitor = app.browser()
      expect((await visitor.get("/api/setup")).body).toEqual({ signupOpen: true })
      expect((await visitor.get("/api/me")).status).toBe(401)
    }),
  )

  it.effect("the first signup becomes admin and closes signup", () =>
    run(async (app) => {
      admin.browser = app.browser()
      const response = await signUp(admin.browser, "Alice", "alice@example.com")
      expect(response.status).toBe(200)

      const me = await admin.browser.get("/api/me")
      expect(me.body).toMatchObject({ name: "Alice", role: "admin", distanceUnit: "km" })
      expect((await app.browser().get("/api/setup")).body).toEqual({ signupOpen: false })
    }),
  )

  it.effect("a second visitor cannot sign up without an invite", () =>
    run(async (app) => {
      const response = await signUp(app.browser(), "Mallory", "mallory@example.com")
      expect(response.status).toBe(403)
      expect(response.body.message).toMatch(/invite-only/)

      const users = await admin.browser.get("/api/admin/users")
      expect(users.body.map((u: { email: string }) => u.email)).toEqual(["alice@example.com"])
    }),
  )

  it.effect("the admin invites a user who signs up as a member", () =>
    run(async (app) => {
      const created = await admin.browser.send("POST", "/api/admin/invites", {
        email: "Bob@Example.com",
      })
      expect(created.status).toBe(200)
      expect(created.body.invite).toMatchObject({ email: "bob@example.com", status: "pending" })
      memberInviteUrl = created.body.url
      expect(memberInviteUrl).toMatch(/^http:\/\/localhost:3000\/invite\//)

      const token = inviteTokenFrom(memberInviteUrl)
      expect((await app.browser().get(`/api/invites/${token}`)).body).toEqual({
        email: "bob@example.com",
      })

      const wrongEmail = await signUp(app.browser(), "Eve", "eve@example.com", token)
      expect(wrongEmail.status).toBe(403)

      member.browser = app.browser()
      expect((await signUp(member.browser, "Bob", "bob@example.com", token)).status).toBe(200)
      expect((await member.browser.get("/api/me")).body).toMatchObject({
        email: "bob@example.com",
        role: "member",
      })

      const invites = await admin.browser.get("/api/admin/invites")
      expect(invites.body[0]).toMatchObject({ email: "bob@example.com", status: "accepted" })
    }),
  )

  it.effect("an invite works only once", () =>
    run(async (app) => {
      const token = inviteTokenFrom(memberInviteUrl)
      expect((await app.browser().get(`/api/invites/${token}`)).status).toBe(404)
      const reuse = await signUp(app.browser(), "Bob 2", "bob@example.com", token)
      expect(reuse.status).not.toBe(200)
    }),
  )

  it.effect("a revoked invite cannot be used", () =>
    run(async (app) => {
      const created = await admin.browser.send("POST", "/api/admin/invites", {
        email: "carol@example.com",
      })
      const revoked = await admin.browser.send(
        "DELETE",
        `/api/admin/invites/${created.body.invite.id}`,
      )
      expect(revoked.status).toBe(204)

      const token = inviteTokenFrom(created.body.url)
      expect((await signUp(app.browser(), "Carol", "carol@example.com", token)).status).toBe(403)
    }),
  )

  it.effect("inviting an existing user is a conflict", () =>
    run(async () => {
      const response = await admin.browser.send("POST", "/api/admin/invites", {
        email: "bob@example.com",
      })
      expect(response.status).toBe(409)
      expect(response.body._tag).toBe("EmailAlreadyRegistered")
    }),
  )

  it.effect("members cannot use admin endpoints", () =>
    run(async () => {
      for (const path of ["/api/admin/users", "/api/admin/invites", "/api/admin/settings"]) {
        const response = await member.browser.get(path)
        expect(response.status).toBe(403)
        expect(response.body._tag).toBe("Forbidden")
      }
      const invite = await member.browser.send("POST", "/api/admin/invites", {
        email: "friend@example.com",
      })
      expect(invite.status).toBe(403)
    }),
  )

  it.effect("each user only sees and changes their own settings", () =>
    run(async () => {
      const updated = await member.browser.send("PATCH", "/api/me/settings", { distanceUnit: "mi" })
      expect(updated.body).toMatchObject({ email: "bob@example.com", distanceUnit: "mi" })

      expect((await member.browser.get("/api/me")).body.distanceUnit).toBe("mi")
      expect((await admin.browser.get("/api/me")).body).toMatchObject({
        email: "alice@example.com",
        distanceUnit: "km",
      })

      const invalid = await member.browser.send("PATCH", "/api/me/settings", {
        distanceUnit: "furlongs",
      })
      expect(invalid.status).toBe(400)
    }),
  )

  it.effect("the Google key is tested before it is saved", () =>
    run(async (app) => {
      expect((await admin.browser.get("/api/admin/settings")).body).toEqual({
        googleApiKey: { source: "none", last4: null },
      })

      const rejected = await admin.browser.send("PUT", "/api/admin/settings/google-api-key", {
        apiKey: "invalid-key",
      })
      expect(rejected.status).toBe(422)
      expect(rejected.body.message).toMatch(/Google rejected the key/)

      const saved = await admin.browser.send("PUT", "/api/admin/settings/google-api-key", {
        apiKey: "  AIza-good-key-9876  ",
      })
      expect(saved.body).toEqual({ googleApiKey: { source: "instance", last4: "9876" } })

      const otherSession = app.browser()
      await otherSession.send("POST", "/api/auth/sign-in/email", {
        email: "alice@example.com",
        password,
      })
      expect((await otherSession.get("/api/admin/settings")).body.googleApiKey.last4).toBe("9876")

      const cleared = await admin.browser.send("DELETE", "/api/admin/settings/google-api-key")
      expect(cleared.body).toEqual({ googleApiKey: { source: "none", last4: null } })
    }),
  )

  it.effect("signing out ends the session and signing in restores it", () =>
    run(async () => {
      expect((await admin.browser.send("POST", "/api/auth/sign-out", {})).status).toBe(200)
      expect((await admin.browser.get("/api/me")).status).toBe(401)

      const wrong = await admin.browser.send("POST", "/api/auth/sign-in/email", {
        email: "alice@example.com",
        password: "not the password",
      })
      expect(wrong.status).toBe(401)

      const signedIn = await admin.browser.send("POST", "/api/auth/sign-in/email", {
        email: "alice@example.com",
        password,
      })
      expect(signedIn.status).toBe(200)
      expect((await admin.browser.get("/api/me")).body.role).toBe("admin")
    }),
  )
})
