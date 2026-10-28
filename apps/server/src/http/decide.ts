import { Api, CurrentUser, ModuleDisabled } from "@placard/domain"
import { RESTAURANTS_DECIDE_ID } from "@placard/module-restaurants-decide/manifest"
import { Decide } from "@placard/module-restaurants-decide/server"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { SqlClient } from "effect/sql"

const requireDecide = (ownerId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ enabled: boolean; visible: boolean | null }>`
      select i.enabled, p.visible
      from instance_modules i
      left join user_module_prefs p
        on p.module_id = i.module_id and p.user_id = ${ownerId}
      where i.module_id = ${RESTAURANTS_DECIDE_ID}`.pipe(Effect.orDie)
    const row = rows[0]
    const ok = row != null && row.enabled && (row.visible ?? true)
    if (!ok) {
      return yield* new ModuleDisabled({
        message: "Decide is not enabled for you on this instance.",
      })
    }
  })

export const DecideApiLive = HttpApiBuilder.group(
  Api,
  "decide",
  Effect.fn(function* (handlers) {
    const decide = yield* Decide
    return handlers
      .handle("preview", ({ payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          yield* requireDecide(me.id)
          return yield* decide.preview(me.id, payload)
        }),
      )
      .handle("spin", ({ payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          yield* requireDecide(me.id)
          return yield* decide.spin(me.id, payload)
        }),
      )
  }),
)
