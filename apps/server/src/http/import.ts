import { Api, CurrentUser } from "@placard/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Import } from "../import/import.ts"

const withMe = <A, E, R>(f: (me: CurrentUser["Service"]) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    return yield* f(yield* CurrentUser)
  })

export const ImportApiLive = HttpApiBuilder.group(
  Api,
  "import",
  Effect.fn(function* (handlers) {
    const imports = yield* Import
    return handlers
      .handle("listRuns", () => withMe((me) => imports.listRuns(me.id)))
      .handle("start", ({ payload }) => withMe((me) => imports.start(me.id, payload)))
      .handle("getRun", ({ params }) => withMe((me) => imports.getRun(me.id, params.id)))
      .handle("listEntries", ({ params, payload }) =>
        withMe((me) => imports.listEntries(me.id, params.id, payload)),
      )
      .handle("setDecisions", ({ params, payload }) =>
        withMe((me) => imports.setDecisions(me.id, params.id, payload.entryIds, payload.decision)),
      )
      .handle("setListDecision", ({ params, payload }) =>
        withMe((me) =>
          imports.setListDecision(me.id, params.id, payload.sourceList, payload.decision),
        ),
      )
      .handle("commit", ({ params }) => withMe((me) => imports.commit(me.id, params.id)))
      .handle("undoPreview", ({ params }) => withMe((me) => imports.undoPreview(me.id, params.id)))
      .handle("undo", ({ params, payload }) =>
        withMe((me) => imports.undo(me.id, params.id, payload.confirmEdited)),
      )
      .handle("dismissReview", ({ params }) =>
        withMe((me) => imports.dismissReview(me.id, params.id, params.entryId)),
      )
      .handle("acceptReview", ({ params }) =>
        withMe((me) => imports.acceptReview(me.id, params.id, params.entryId)),
      )
      .handle("resolveReview", ({ params, payload }) =>
        withMe((me) => imports.resolveReview(me.id, params.id, params.entryId, payload)),
      )
  }),
)
