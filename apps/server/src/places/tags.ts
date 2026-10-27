import { NameTaken, TagNotFound, type TagRef, type TagSummary } from "@placard/domain"
import { Context, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { v7 as uuidv7 } from "uuid"

/** A user's tags. Names are unique per owner, case-insensitive. */
export class Tags extends Context.Service<
  Tags,
  {
    readonly list: (ownerId: string) => Effect.Effect<ReadonlyArray<TagSummary>>
    readonly ensure: (ownerId: string, name: string) => Effect.Effect<TagRef>
    readonly create: (ownerId: string, name: string) => Effect.Effect<TagRef, NameTaken>
    readonly rename: (
      ownerId: string,
      id: string,
      name: string,
    ) => Effect.Effect<TagRef, TagNotFound | NameTaken>
    readonly remove: (ownerId: string, id: string) => Effect.Effect<void, TagNotFound>
  }
>()("placard/Tags") {
  static readonly layer = Layer.effect(
    Tags,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const owned = (ownerId: string) => sql`owner_id = ${ownerId}`

      const findByName = (ownerId: string, name: string) =>
        sql<TagRef>`
          select id, name from tags
          where ${owned(ownerId)} and lower(name) = lower(${name})`.pipe(
          Effect.map((rows) => rows[0]),
          Effect.orDie,
        )

      const insert = (ownerId: string, name: string) =>
        sql<TagRef>`
          insert into tags (id, owner_id, name)
          select ${uuidv7()}, ${ownerId}, ${name}
          where not exists (
            select 1 from tags where owner_id = ${ownerId} and lower(name) = lower(${name})
          )
          returning id, name`.pipe(Effect.orDie)

      return {
        list: (ownerId) =>
          sql<TagSummary>`
            select t.id, t.name, count(pt.place_id)::int as "placeCount"
            from tags t
            left join place_tags pt on pt.tag_id = t.id
            left join places p on p.id = pt.place_id and p.deleted_at is null
            where t.owner_id = ${ownerId}
            group by t.id
            order by lower(t.name)`.pipe(Effect.orDie),

        ensure: Effect.fn("Tags.ensure")(function* (ownerId, name) {
          const existing = yield* findByName(ownerId, name)
          if (existing) return existing
          const inserted = yield* insert(ownerId, name)
          if (inserted[0]) return inserted[0]
          return (yield* findByName(ownerId, name)) as TagRef
        }),

        create: Effect.fn("Tags.create")(function* (ownerId, name) {
          const inserted = yield* insert(ownerId, name)
          if (inserted[0]) return inserted[0]
          return yield* new NameTaken({ message: `You already have a tag named "${name}".` })
        }),

        rename: Effect.fn("Tags.rename")(function* (ownerId, id, name) {
          const clash = yield* findByName(ownerId, name)
          if (clash && clash.id !== id) {
            return yield* new NameTaken({ message: `You already have a tag named "${name}".` })
          }
          const updated = yield* sql<TagRef>`
            update tags set name = ${name}, updated_at = now()
            where ${owned(ownerId)} and id = ${id}
            returning id, name`.pipe(Effect.orDie)
          if (updated[0]) return updated[0]
          return yield* new TagNotFound()
        }),

        remove: (ownerId, id) =>
          sql`delete from tags where ${owned(ownerId)} and id = ${id} returning id`.pipe(
            Effect.orDie,
            Effect.flatMap((rows) => (rows.length > 0 ? Effect.void : new TagNotFound())),
          ),
      }
    }),
  )
}
