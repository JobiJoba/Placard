import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { type Browser, TestApp } from "../layers/app.ts"

const password = "correct horse battery"
const SESSION = "0b6a3c2e-6f4e-4a1f-9a55-6c1a1e0f2d11"
const MICHELE = "ChIJ-fixture-da-michele"

const signUp = (browser: Browser, name: string, email: string, inviteToken?: string) =>
  browser.send("POST", "/api/auth/sign-up/email", { name, email, password, inviteToken })

const inviteTokenFrom = (url: string) => new URL(url).pathname.split("/").pop() as string

const run = <A>(f: (app: TestApp["Service"]) => Promise<A>) =>
  Effect.gen(function* () {
    const app = yield* TestApp
    return yield* Effect.promise(() => f(app))
  })

const addManual = (browser: Browser, name: string) =>
  browser.send("POST", "/api/places/manual", {
    name,
    category: "restaurant",
    location: { lat: 48.2, lng: 16.37 },
    address: "Vienna",
  })

const addFromGoogle = (browser: Browser, googlePlaceId: string) =>
  browser.send("POST", "/api/places/google", {
    googlePlaceId,
    source: "autocomplete",
    sessionToken: SESSION,
  })

layer(TestApp.layer, { concurrent: false, timeout: 120_000 })("household", (it) => {
  const admin = { browser: undefined as unknown as Browser }
  const member = { browser: undefined as unknown as Browser }
  let adminPlaceId = ""
  let memberPlaceId = ""

  it.effect("sets up admin, member, and places", () =>
    run(async (app) => {
      admin.browser = app.browser()
      expect((await signUp(admin.browser, "Alice", "alice@example.com")).status).toBe(200)

      const invite = await admin.browser.send("POST", "/api/admin/invites", {
        email: "bob@example.com",
      })
      member.browser = app.browser()
      expect(
        (await signUp(member.browser, "Bob", "bob@example.com", inviteTokenFrom(invite.body.url)))
          .status,
      ).toBe(200)

      const adminPlace = await addManual(admin.browser, "Alice Pizza")
      expect(adminPlace.status).toBe(200)
      adminPlaceId = adminPlace.body.place.id

      const memberPlace = await addManual(member.browser, "Bob Pizza")
      expect(memberPlace.status).toBe(200)
      memberPlaceId = memberPlace.body.place.id

      expect((await admin.browser.get("/api/me")).body.householdEnabled).toBe(false)
      expect((await member.browser.get("/api/me")).body.householdEnabled).toBe(false)
    }),
  )

  it.effect("with household off, members cannot see each other's places", () =>
    run(async () => {
      expect((await member.browser.get(`/api/places/${adminPlaceId}`)).status).toBe(404)
      const share = await admin.browser.send("PATCH", `/api/places/${adminPlaceId}/visibility`, {
        visibility: "household",
      })
      expect(share.status).toBe(409)
      expect(share.body._tag).toBe("HouseholdDisabled")
    }),
  )

  it.effect("admin enables household mode", () =>
    run(async () => {
      const enabled = await admin.browser.send("PATCH", "/api/admin/settings/household", {
        enabled: true,
      })
      expect(enabled.status).toBe(200)
      expect(enabled.body.householdEnabled).toBe(true)
      expect((await admin.browser.get("/api/me")).body.householdEnabled).toBe(true)
      expect((await member.browser.get("/api/me")).body.householdEnabled).toBe(true)

      const members = await member.browser.get("/api/household/members")
      expect(members.status).toBe(200)
      expect(members.body.map((m: { name: string }) => m.name).sort()).toEqual(["Alice", "Bob"])
    }),
  )

  it.effect("owner can share; other members can read but not edit", () =>
    run(async () => {
      const shared = await admin.browser.send("PATCH", `/api/places/${adminPlaceId}/visibility`, {
        visibility: "household",
      })
      expect(shared.status).toBe(200)
      expect(shared.body.visibility).toBe("household")

      const viewed = await member.browser.get(`/api/places/${adminPlaceId}`)
      expect(viewed.status).toBe(200)
      expect(viewed.body.name).toBe("Alice Pizza")
      expect(viewed.body.owner.name).toBe("Alice")

      const edit = await member.browser.send("PATCH", `/api/places/${adminPlaceId}`, {
        notes: "Bob was here",
      })
      expect(edit.status).toBe(404)

      const search = await member.browser.send("POST", "/api/search", {
        householdScope: "shared",
      })
      expect(search.status).toBe(200)
      expect(search.body.some((hit: { place: { id: string } }) => hit.place.id === adminPlaceId)).toBe(
        true,
      )

      const mine = await member.browser.send("POST", "/api/search", { householdScope: "mine" })
      expect(mine.body.some((hit: { place: { id: string } }) => hit.place.id === adminPlaceId)).toBe(
        false,
      )
      expect(mine.body.some((hit: { place: { id: string } }) => hit.place.id === memberPlaceId)).toBe(
        true,
      )

      const byAlice = await member.browser.send("POST", "/api/search", {
        sharedBy: (await admin.browser.get("/api/me")).body.id,
      })
      expect(
        byAlice.body.some((hit: { place: { id: string } }) => hit.place.id === adminPlaceId),
      ).toBe(true)
    }),
  )

  it.effect("second share of the same google place id conflicts; copy fills empty fields", () =>
    run(async () => {
      expect(
        (await admin.browser.send("PUT", "/api/admin/settings/google-api-key", {
          apiKey: "fixture-key",
        })).status,
      ).toBe(200)

      const aliceCopy = await addFromGoogle(admin.browser, MICHELE)
      expect(aliceCopy.status).toBe(200)
      const aliceId = aliceCopy.body.place.id
      await admin.browser.send("PATCH", `/api/places/${aliceId}`, {
        notes: "Alice notes",
        status: "want_to_go",
      })
      expect(
        (
          await admin.browser.send("PATCH", `/api/places/${aliceId}/visibility`, {
            visibility: "household",
          })
        ).status,
      ).toBe(200)

      const bobCopy = await addFromGoogle(member.browser, MICHELE)
      expect(bobCopy.status).toBe(200)
      const bobId = bobCopy.body.place.id
      await member.browser.send("PATCH", `/api/places/${bobId}`, {
        notes: "Bob notes",
        status: "been_there",
      })

      const conflict = await member.browser.send("PATCH", `/api/places/${bobId}/visibility`, {
        visibility: "household",
      })
      expect(conflict.status).toBe(409)
      expect(conflict.body._tag).toBe("HouseholdPlaceConflict")
      expect(conflict.body.existingPlaceId).toBe(aliceId)

      // Target already has notes/status — copy should not overwrite.
      const copied = await member.browser.send("POST", `/api/places/${bobId}/copy-into/${aliceId}`, {
        notes: true,
        status: true,
        customFields: true,
      })
      expect(copied.status).toBe(200)
      expect(copied.body.notes).toBe("Alice notes")
      expect(copied.body.status).toBe("want_to_go")

      // Clear target notes then copy fills them.
      await admin.browser.send("PATCH", `/api/places/${aliceId}`, { notes: "" })
      const filled = await member.browser.send("POST", `/api/places/${bobId}/copy-into/${aliceId}`, {
        notes: true,
      })
      expect(filled.body.notes).toBe("Bob notes")
    }),
  )

  it.effect("disabling household hides shared places from non-owners again", () =>
    run(async () => {
      expect(
        (
          await admin.browser.send("PATCH", "/api/admin/settings/household", {
            enabled: false,
          })
        ).body.householdEnabled,
      ).toBe(false)
      expect((await member.browser.get(`/api/places/${adminPlaceId}`)).status).toBe(404)
      expect((await admin.browser.get(`/api/places/${adminPlaceId}`)).status).toBe(200)
    }),
  )
})
