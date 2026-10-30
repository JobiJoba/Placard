import {
  type CustomFieldCreate,
  CustomFieldInvalid,
  CustomFieldNotFound,
  type CustomFieldType,
  type CustomFieldUpdate,
  normalizeCustomFieldLabel,
  type PlaceCustomField,
  validateCustomFieldValue,
} from "@placard/domain"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { v7 as uuidv7 } from "uuid"

type FieldRow = {
  readonly id: string
  readonly place_id: string
  readonly label: string
  readonly type: string
  readonly value: string
  readonly sort_order: number
}

const toField = (row: FieldRow): PlaceCustomField => ({
  id: row.id,
  label: row.label,
  type: row.type as CustomFieldType,
  value: row.value,
  sortOrder: row.sort_order,
})

/** Load custom fields for many places, ordered for display. */
export const loadCustomFieldsMap = (sql: SqlClient.SqlClient, placeIds: ReadonlyArray<string>) => {
  if (placeIds.length === 0) {
    return Effect.succeed(new Map<string, PlaceCustomField[]>())
  }
  return sql<FieldRow>`
    select id, place_id, label, type, value, sort_order
    from place_custom_fields
    where ${sql.in("place_id", placeIds)}
    order by sort_order asc, created_at asc`.pipe(
    Effect.map((rows) => {
      const map = new Map<string, PlaceCustomField[]>()
      for (const row of rows) {
        const list = map.get(row.place_id) ?? []
        list.push(toField(row))
        map.set(row.place_id, list)
      }
      return map
    }),
    Effect.orDie,
  )
}

export const createCustomField = (
  sql: SqlClient.SqlClient,
  placeId: string,
  input: CustomFieldCreate,
) =>
  Effect.gen(function* () {
    const checked = validateCustomFieldValue(input.type, input.value)
    if (!checked.ok) return yield* new CustomFieldInvalid({ message: checked.message })

    const id = uuidv7()
    const labelKey = normalizeCustomFieldLabel(input.label)
    const nextOrder = yield* sql<{ max: number | null }>`
      select max(sort_order) as max from place_custom_fields where place_id = ${placeId}`.pipe(
      Effect.map((rows) => (rows[0]?.max ?? -1) + 1),
      Effect.orDie,
    )

    yield* sql`
      insert into place_custom_fields (id, place_id, label, label_key, type, value, sort_order)
      values (
        ${id}, ${placeId}, ${input.label.trim()}, ${labelKey},
        ${input.type}, ${checked.value}, ${nextOrder}
      )`.pipe(Effect.orDie)

    return id
  })

export const updateCustomField = (
  sql: SqlClient.SqlClient,
  placeId: string,
  fieldId: string,
  patch: CustomFieldUpdate,
) =>
  Effect.gen(function* () {
    const existing = yield* sql<FieldRow>`
      select id, place_id, label, type, value, sort_order
      from place_custom_fields
      where id = ${fieldId} and place_id = ${placeId}`.pipe(
      Effect.orDie,
      Effect.flatMap((rows) => (rows[0] ? Effect.succeed(rows[0]) : new CustomFieldNotFound())),
    )

    const type = (patch.type ?? existing.type) as CustomFieldType
    const rawValue = patch.value ?? existing.value
    const checked = validateCustomFieldValue(type, rawValue)
    if (!checked.ok) return yield* new CustomFieldInvalid({ message: checked.message })

    const label = patch.label?.trim() ?? existing.label
    const labelKey = normalizeCustomFieldLabel(label)

    yield* sql`
      update place_custom_fields
      set label = ${label},
          label_key = ${labelKey},
          type = ${type},
          value = ${checked.value}
      where id = ${fieldId} and place_id = ${placeId}`.pipe(Effect.orDie)
  })

export const removeCustomField = (sql: SqlClient.SqlClient, placeId: string, fieldId: string) =>
  sql`
    delete from place_custom_fields
    where id = ${fieldId} and place_id = ${placeId}
    returning id`.pipe(
    Effect.orDie,
    Effect.flatMap((rows) => (rows[0] ? Effect.void : new CustomFieldNotFound())),
  )
