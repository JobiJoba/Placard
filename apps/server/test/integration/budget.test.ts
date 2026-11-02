import { expect, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { Budget } from "../../src/budget/budget.ts"
import { billingPeriod } from "../../src/budget/pricing.ts"
import { TestApp } from "../layers/app.ts"

const BudgetTest = Budget.layer.pipe(Layer.provideMerge(TestApp.layer))
layer(BudgetTest, { concurrent: false, timeout: 120000 })("Google budget", (it) => {
  const reset = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`delete from google_usage`
    yield* sql`update google_budget set monthly_limit_cents = null, pause_at_limit = false, use_free_allowance = false where id = 1`
  })
  it.effect("persists attempts, separates months and does not double-count map reservations", () =>
    Effect.gen(function* () {
      yield* reset
      const budget = yield* Budget
      const sql = yield* SqlClient.SqlClient
      yield* budget.reserve("maps", null, "same-map")
      yield* budget.reserve("maps", null, "same-map")
      yield* budget.reserve("photo") // interrupted requests remain counted
      yield* sql`insert into google_usage (id, month, sku, source) values ('old', '2000-01', 'photo', 'test')`
      const view = yield* budget.view
      expect(view.estimatedUsd).toBe(0.014)
      expect(view.rows.find((r) => r.sku === "maps")?.requests).toBe(1)
      expect(view.rows.find((r) => r.sku === "photo")?.requests).toBe(1)
    }),
  )
  it.effect("serializes concurrent reservations so only the affordable request runs", () =>
    Effect.gen(function* () {
      yield* reset
      const budget = yield* Budget
      yield* budget.update({ monthlyLimitUsd: 0.01, pauseAtLimit: true, useFreeAllowance: false })
      const outcomes = yield* Effect.all(
        Array.from({ length: 8 }, () => budget.reserve("maps").pipe(Effect.result)),
        { concurrency: "unbounded" },
      )
      expect(outcomes.filter((r) => r._tag === "Success")).toHaveLength(1)
      const view = yield* budget.view
      expect(view.estimatedUsd).toBe(0.007)
      expect(view.rows.find((r) => r.sku === "maps")?.requests).toBe(1)
      yield* budget.update({ monthlyLimitUsd: 0.01, pauseAtLimit: false, useFreeAllowance: false })
      yield* budget.reserve("maps")
      expect((yield* budget.view).estimatedUsd).toBe(0.014)
    }),
  )
  it.effect("allows free requests at a zero budget and stops at the allowance boundary", () =>
    Effect.gen(function* () {
      yield* reset
      const budget = yield* Budget
      const sql = yield* SqlClient.SqlClient
      yield* budget.update({ monthlyLimitUsd: 0, pauseAtLimit: true, useFreeAllowance: true })
      yield* sql`insert into google_usage (id, month, sku, source) select 'seed-' || n, ${billingPeriod().month}, 'details', 'test' from generate_series(1,999) n`
      yield* budget.reserve("details")
      const denied = yield* budget.reserve("details").pipe(Effect.flip)
      expect(denied.message).toContain("budget")
      yield* budget.reserve("photo") // separate allowance
      const estimate = yield* budget.estimate({ action: "refresh", count: 2 })
      expect(estimate.estimatedUsd).toBe(0.04)
      expect(estimate.paused).toBe(true)
    }),
  )
  it.effect(
    "reconciles successful sessions but never refunds reused tokens or unknown failures",
    () =>
      Effect.gen(function* () {
        yield* reset
        const budget = yield* Budget
        const first = yield* budget.reserve("autocomplete", "session")
        yield* budget.complete(first)
        yield* budget.reserve("autocomplete", "session") // failed or unknown
        const details = yield* budget.reserve("detailsSession", "session")
        yield* budget.complete(details)
        const reused = yield* budget.reserve("autocomplete", "session")
        yield* budget.complete(reused)
        const next = yield* budget.reserve("detailsSession", "session")
        yield* budget.complete(next)
        const view = yield* budget.view
        expect(view.rows.find((r) => r.sku === "autocompleteSession")?.requests).toBe(1)
        expect(view.rows.find((r) => r.sku === "autocomplete")?.requests).toBe(2)
        expect(view.rows.find((r) => r.sku === "detailsSession")?.requests).toBe(2)
      }),
  )
  it.effect("protects settings and tracks real Places calls through the router", () =>
    Effect.gen(function* () {
      yield* reset
      const app = yield* TestApp
      yield* Effect.promise(async () => {
        const anon = app.browser()
        expect((await anon.get("/api/admin/budget")).status).toBe(401)
        const admin = app.browser()
        await admin.send("POST", "/api/auth/sign-up/email", {
          name: "Budget Admin",
          email: "budget@example.com",
          password: "correct horse battery",
        })
        expect((await admin.get("/api/admin/budget")).status).toBe(200)
        expect(
          (
            await admin.send("PUT", "/api/admin/budget", {
              monthlyLimitUsd: -1,
              pauseAtLimit: true,
              useFreeAllowance: false,
            })
          ).status,
        ).toBe(400)
        await admin.send("PUT", "/api/admin/settings/google-api-key", { apiKey: "fixture-key" })
        const first = await admin.get("/api/google/places/ChIJ-fixture-da-michele")
        expect(first.status).toBe(200)
        const again = await admin.get("/api/google/places/ChIJ-fixture-da-michele")
        expect(again.status).toBe(200)
        const view = (await admin.get("/api/admin/budget")).body
        expect(view.rows.find((r: { sku: string }) => r.sku === "details").requests).toBe(1)
        await admin.send("PUT", "/api/admin/budget", {
          monthlyLimitUsd: 0,
          pauseAtLimit: true,
          useFreeAllowance: false,
        })
        const blocked = await admin.send("POST", "/api/google/autocomplete", {
          input: "Naples",
          sessionToken: "budget-session",
          near: null,
        })
        expect(blocked.body.message).toContain("budget")
        const estimate = await admin.send("POST", "/api/google/estimate", {
          action: "refresh",
          count: 200,
        })
        expect(estimate.body).toMatchObject({ estimatedUsd: 5.4, paused: true })
        const invite = await admin.send("POST", "/api/admin/invites", {
          email: "member@example.com",
        })
        const member = app.browser()
        await member.send("POST", "/api/auth/sign-up/email", {
          name: "Member",
          email: "member@example.com",
          password: "correct horse battery",
          inviteToken: new URL(invite.body.url).pathname.split("/").pop(),
        })
        expect((await member.get("/api/admin/budget")).status).toBe(403)
        expect(
          (
            await member.send("PUT", "/api/admin/budget", {
              monthlyLimitUsd: null,
              pauseAtLimit: false,
              useFreeAllowance: false,
            })
          ).status,
        ).toBe(403)
      })
    }),
  )
})
