import {
  type ListInput,
  ListNotFound,
  type ListUpdate,
  NameTaken,
  type PlaceList,
} from "@placard/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { v7 as uuidv7 } from "uuid"

interface ListRow {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly placeCount: number
  readonly created_at: Date
}

const toList = (row: ListRow): PlaceList => ({
  id: row.id,
  name: row.name,
  description: row.description,
  placeCount: row.placeCount,
  createdAt: DateTime.fromDateUnsafe(row.created_at),
})

/** A user's lists. Deleting a list leaves its places in the library. */
export class Lists extends Context.Service<
  Lists,
  {
    readonly list: (ownerId: string) => Effect.Effect<ReadonlyArray<PlaceList>>
    readonly get: (ownerId: string, id: string) => Effect.Effect<PlaceList, ListNotFound>
    readonly create: (ownerId: string, input: ListInput) => Effect.Effect<PlaceList, NameTaken>
    /** Find by name or create; used when committing Takeout lists. */
    readonly ensure: (
      ownerId: string,
      name: string,
      options?: { readonly importRunId?: string },
    ) => Effect.Effect<PlaceList>
    readonly update: (
      ownerId: string,
      id: string,
      patch: ListUpdate,
    ) => Effect.Effect<PlaceList, ListNotFound | NameTaken>
    readonly remove: (ownerId: string, id: string) => Effect.Effect<void, ListNotFound>
  }
>()("placard/Lists") {
  static readonly layer = Layer.effect(
    Lists,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const owned = (ownerId: string) => sql`owner_id = ${ownerId}`
      const columns = sql`
        l.id, l.name, l.description, l.created_at,
        count(li.place_id) filter (where p.deleted_at is null)::int as "placeCount"`

      const findByName = (ownerId: string, name: string) =>
        sql<{ id: string }>`
          select id from lists
          where ${owned(ownerId)} and lower(name) = lower(${name})`.pipe(
          Effect.map((rows) => rows[0]),
          Effect.orDie,
        )

      const one = (ownerId: string, id: string) =>
        sql<ListRow>`
          select ${columns}
          from lists l
          left join list_items li on li.list_id = l.id
          left join places p on p.id = li.place_id
          where l.owner_id = ${ownerId} and l.id = ${id}
          group by l.id`.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0] ? Effect.succeed(toList(rows[0])) : new ListNotFound(),
          ),
        )

      const nameTaken = (name: string) =>
        new NameTaken({ message: `You already have a list named "${name}".` })

      return {
        list: (ownerId) =>
          sql<ListRow>`
            select ${columns}
            from lists l
            left join list_items li on li.list_id = l.id
            left join places p on p.id = li.place_id
            where l.owner_id = ${ownerId}
            group by l.id
            order by lower(l.name)`.pipe(
            Effect.map((rows) => rows.map(toList)),
            Effect.orDie,
          ),

        get: one,

        ensure: Effect.fn("Lists.ensure")(function* (ownerId, name, options) {
          const existing = yield* findByName(ownerId, name)
          if (existing) return yield* one(ownerId, existing.id).pipe(Effect.orDie)
          const id = uuidv7()
          const importRunId = options?.importRunId ?? null
          const inserted = yield* sql<{ id: string }>`
            insert into lists (id, owner_id, name, description, import_run_id)
            select ${id}, ${ownerId}, ${name}, ${null}, ${importRunId}
            where not exists (
              select 1 from lists
              where owner_id = ${ownerId} and lower(name) = lower(${name})
            )
            returning id`.pipe(Effect.orDie)
          if (inserted[0]) return yield* one(ownerId, inserted[0].id).pipe(Effect.orDie)
          const again = yield* findByName(ownerId, name)
          // Concurrent insert won the race; row must exist.
          if (!again) return yield* Effect.die(new Error(`list race for ${name}`))
          return yield* one(ownerId, again.id).pipe(Effect.orDie)
        }),

        create: Effect.fn("Lists.create")(function* (ownerId, input) {
          const inserted = yield* sql<{ id: string }>`
            insert into lists (id, owner_id, name, description)
            select ${uuidv7()}, ${ownerId}, ${input.name}, ${input.description}
            where not exists (
              select 1 from lists
              where owner_id = ${ownerId} and lower(name) = lower(${input.name})
            )
            returning id`.pipe(Effect.orDie)
          if (!inserted[0]) return yield* nameTaken(input.name)
          return yield* one(ownerId, inserted[0].id).pipe(Effect.orDie)
        }),

        update: Effect.fn("Lists.update")(function* (ownerId, id, patch) {
          const current = yield* one(ownerId, id)
          const name = patch.name ?? current.name
          const description =
            patch.description !== undefined ? patch.description : current.description
          if (patch.name !== undefined) {
            const clash = yield* findByName(ownerId, name)
            if (clash && clash.id !== id) return yield* nameTaken(name)
          }
          yield* sql`
            update lists set name = ${name}, description = ${description}, updated_at = now()
            where ${owned(ownerId)} and id = ${id}`.pipe(Effect.orDie)
          return yield* one(ownerId, id)
        }),

        remove: (ownerId, id) =>
          sql`delete from lists where ${owned(ownerId)} and id = ${id} returning id`.pipe(
            Effect.orDie,
            Effect.flatMap((rows) => (rows.length > 0 ? Effect.void : new ListNotFound())),
          ),
      }
    }),
  )
}
