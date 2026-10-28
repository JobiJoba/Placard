import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { type Browser, TestApp } from "../layers/app.ts"

const password = "correct horse battery"
const fixtureRoot = fileURLToPath(new URL("../../../../test/fixtures/takeout", import.meta.url))

const walk = (dir: string, base = dir): Array<{ path: string; text: string }> => {
  const out: Array<{ path: string; text: string }> = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, base))
    else {
      out.push({
        path: full.slice(base.length + 1).replace(/\\/g, "/"),
        text: readFileSync(full, "utf8"),
      })
    }
  }
  return out
}

const run = <A>(f: (app: TestApp["Service"]) => Promise<A>) =>
  Effect.gen(function* () {
    const app = yield* TestApp
    return yield* Effect.promise(() => f(app))
  })

layer(TestApp.layer, { concurrent: false, timeout: 120_000 })("takeout import", (it) => {
  const admin = { browser: undefined as unknown as Browser }

  it.effect("setup: sign up and set a Google key", () =>
    run(async (app) => {
      admin.browser = app.browser()
      await admin.browser.send("POST", "/api/auth/sign-up/email", {
        name: "Importer",
        email: "import@example.com",
        password,
      })
      const key = await admin.browser.send("PUT", "/api/admin/settings/google-api-key", {
        apiKey: "fixture-key",
      })
      expect(key.status).toBe(200)
    }),
  )

  it.effect("parse → triage → skip a list → commit → undo", () =>
    run(async () => {
      const started = await admin.browser.send("POST", "/api/import/runs", {
        kind: "files",
        files: walk(fixtureRoot),
      })
      expect(started.status).toBe(200)
      expect(started.body.status).toBe("triage")
      expect(started.body.counts.parsed).toBeGreaterThan(3)

      const runId = started.body.id as string
      const entries = await admin.browser.send("POST", `/api/import/runs/${runId}/entries`, {})
      expect(entries.status).toBe(200)
      expect(entries.body.some((e: { needsLocation: boolean }) => e.needsLocation)).toBe(true)

      const skipList = await admin.browser.send("POST", `/api/import/runs/${runId}/lists`, {
        sourceList: "Want to go",
        decision: "skip",
      })
      expect(skipList.status).toBe(200)
      expect(skipList.body.counts.skipped).toBeGreaterThan(0)

      const pending = await admin.browser.send("POST", `/api/import/runs/${runId}/entries`, {
        decision: "pending",
      })
      const keepRest = await admin.browser.send("POST", `/api/import/runs/${runId}/decisions`, {
        entryIds: pending.body.map((e: { id: string }) => e.id),
        decision: "keep",
      })
      expect(keepRest.status).toBe(200)
      expect(keepRest.body.counts.pending).toBe(0)
      expect(keepRest.body.counts.skipped).toBeGreaterThan(0)

      const committed = await admin.browser.send("POST", `/api/import/runs/${runId}/commit`)
      expect(committed.status).toBe(200)
      expect(committed.body.status).toBe("done")
      expect(committed.body.counts.matched + committed.body.counts.needsReview).toBeGreaterThan(0)

      const lists = await admin.browser.get("/api/lists")
      expect(lists.body.map((l: { name: string }) => l.name)).toContain("City trip")

      const places = await admin.browser.get("/api/places")
      expect(places.body.length).toBeGreaterThan(0)

      const undone = await admin.browser.send("POST", `/api/import/runs/${runId}/undo`, {
        confirmEdited: true,
      })
      expect(undone.status).toBe(200)
      expect(undone.body.status).toBe("undone")

      const after = await admin.browser.get("/api/places")
      expect(after.body.length).toBe(0)
    }),
  )

  it.effect("re-import remembers skips", () =>
    run(async () => {
      const started = await admin.browser.send("POST", "/api/import/runs", {
        kind: "files",
        files: walk(fixtureRoot),
      })
      expect(started.status).toBe(200)
      expect(started.body.counts.skipped).toBeGreaterThan(0)

      const entries = await admin.browser.send(
        "POST",
        `/api/import/runs/${started.body.id}/entries`,
        {
          decision: "skip",
        },
      )
      expect(
        entries.body.every((e: { sourceList: string | null }) => e.sourceList === "Want to go"),
      ).toBe(true)
    }),
  )
})
