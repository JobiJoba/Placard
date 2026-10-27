import { type EditableField, editableFields, type PlaceCategory } from "@placard/domain"

/** The values of the fields that Google can fill and the owner can edit. */
export interface EditableValues {
  readonly name: string
  readonly category: PlaceCategory
  readonly address: string | null
}

export interface Overridable {
  readonly values: EditableValues
  /** Fields the owner set by hand. */
  readonly manual: ReadonlyArray<EditableField>
}

const ordered = (fields: ReadonlySet<EditableField>): ReadonlyArray<EditableField> =>
  editableFields.filter((field) => fields.has(field))

/**
 * An owner's edit wins and is remembered. Setting a field to the value it
 * already has is not an edit, so it doesn't pin the field.
 */
export const applyEdit = (current: Overridable, edit: Partial<EditableValues>): Overridable => {
  const manual = new Set(current.manual)
  const values = { ...current.values }
  for (const field of editableFields) {
    if (!(field in edit)) continue
    const next = edit[field]
    if (next === undefined || next === current.values[field]) continue
    Object.assign(values, { [field]: next })
    manual.add(field)
  }
  return { values, manual: ordered(manual) }
}

/** Fresh data from Google replaces every field the owner hasn't edited. */
export const applyFetched = (current: Overridable, fetched: EditableValues): Overridable => {
  const manual = new Set(current.manual)
  const values = { ...current.values }
  for (const field of editableFields) {
    if (!manual.has(field)) Object.assign(values, { [field]: fetched[field] })
  }
  return { values, manual: current.manual }
}
