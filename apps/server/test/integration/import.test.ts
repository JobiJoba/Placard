import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { ServicesLayer } from "../../src/http/api.ts"
import { Import } from "../../src/import/import.ts"
import {
  IMPORT_COMMIT,
  IMPORT_PARSE,
  type ImportCommitJob,
  type ImportParseJob,
} from "../../src/jobs/names.ts"
import { JobQueue } from "../../src/jobs/queue.ts"
import { TestHttpFixtureClient } from "../../src/modules/github-fixture.ts"
import { ModuleRuntime } from "../../src/modules/loader.ts"
import { type Browser, TestApp } from "../layers/app.ts"
import { IntegrationLayer } from "../layers/postgis.ts"

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

// Consume queued jobs explicitly so requests can be checked before any worker runs.
const run = <A>(
  f: (
    app: TestApp["Service"],
    work: (queue: typeof IMPORT_PARSE | typeof IMPORT_COMMIT) => Promise<void>,
  ) => Promise<A>,
) =>
  Effect.gen(function* () {
    const app = yield* TestApp
    const imports = yield* Import
    const { boss } = yield* JobQueue
    const work = async (queue: typeof IMPORT_PARSE | typeof IMPORT_COMMIT) => {
      if (queue === IMPORT_PARSE) {
        for (const job of await boss.fetch<ImportParseJob>(queue, { batchSize: 10 })) {
          await Effect.runPromise(imports.runParseJob(job.data.runId, job.data.upload))
          await boss.complete(queue, job.id)
        }
      } else {
        for (const job of await boss.fetch<ImportCommitJob>(queue, { batchSize: 10 })) {
          await Effect.runPromise(imports.runCommitJob(job.data.runId))
          await boss.complete(queue, job.id)
        }
      }
    }
    return yield* Effect.promise(() => f(app, work))
  })

const ImportTestLayer = Layer.merge(
  TestApp.layer,
  ServicesLayer.pipe(
    Layer.provide(TestHttpFixtureClient),
    Layer.provide(ModuleRuntime.layer),
    Layer.provide(IntegrationLayer),
  ),
)

layer(ImportTestLayer, { concurrent: false, timeout: 120_000 })("takeout import", (it) => {
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
    run(async (_app, work) => {
      const started = await admin.browser.send("POST", "/api/import/runs", {
        kind: "files",
        files: walk(fixtureRoot),
      })
      expect(started.status).toBe(200)
      expect(started.body.status).toBe("parsing")
      expect(started.body.counts.parsed).toBe(0)

      const runId = started.body.id as string
      const before = await admin.browser.send("POST", `/api/import/runs/${runId}/entries`, {})
      expect(before.body).toHaveLength(0)
      await work(IMPORT_PARSE)
      const parsed = await admin.browser.get(`/api/import/runs/${runId}`)
      expect(parsed.body.status).toBe("triage")
      expect(parsed.body.counts.parsed).toBeGreaterThan(3)
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
      expect(committed.body.status).toBe("committing")
      expect((await admin.browser.get("/api/places")).body).toHaveLength(0)
      const duplicate = await admin.browser.send("POST", `/api/import/runs/${runId}/commit`)
      expect(duplicate.status).toBe(400)
      await work(IMPORT_COMMIT)
      const finished = await admin.browser.get(`/api/import/runs/${runId}`)
      expect(finished.body.status).toBe("done")
      expect(finished.body.counts.matched + finished.body.counts.needsReview).toBeGreaterThan(0)

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
    run(async (_app, work) => {
      const started = await admin.browser.send("POST", "/api/import/runs", {
        kind: "files",
        files: walk(fixtureRoot),
      })
      expect(started.status).toBe(200)
      expect(started.body.status).toBe("parsing")
      await work(IMPORT_PARSE)
      const parsed = await admin.browser.get(`/api/import/runs/${started.body.id}`)
      expect(parsed.body.counts.skipped).toBeGreaterThan(0)

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
  it.effect("invalid archives fail in the worker and expose a useful error", () =>
    run(async (_app, work) => {
      const started = await admin.browser.send("POST", "/api/import/runs", {
        kind: "zip",
        filename: "broken.zip",
        contentBase64: "bm90IGEgemlw",
      })
      expect(started.body.status).toBe("parsing")
      await work(IMPORT_PARSE)
      const failed = await admin.browser.get(`/api/import/runs/${started.body.id}`)
      expect(failed.body.status).toBe("failed")
      expect(failed.body.errorMessage).toBeTruthy()
    }),
  )
})
