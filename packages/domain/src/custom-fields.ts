import { Schema } from "effect"

export const customFieldTypes = ["text", "email", "url", "phone", "number", "date"] as const
export const CustomFieldType = Schema.Literals(customFieldTypes)
export type CustomFieldType = typeof CustomFieldType.Type

const Label = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1, { message: "Give the field a label" })),
  Schema.check(Schema.isMaxLength(80)),
)

const ValueText = Schema.Trim.pipe(Schema.check(Schema.isMaxLength(2_000)))

export const PlaceCustomField = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  type: CustomFieldType,
  value: Schema.String,
  sortOrder: Schema.Number,
})
export type PlaceCustomField = typeof PlaceCustomField.Type

export const CustomFieldCreate = Schema.Struct({
  label: Label,
  type: CustomFieldType,
  value: ValueText,
})
export type CustomFieldCreate = typeof CustomFieldCreate.Type

export const CustomFieldUpdate = Schema.Struct({
  label: Schema.optional(Label),
  type: Schema.optional(CustomFieldType),
  value: Schema.optional(ValueText),
})
export type CustomFieldUpdate = typeof CustomFieldUpdate.Type

export class CustomFieldNotFound extends Schema.TaggedError<CustomFieldNotFound>()(
  "CustomFieldNotFound",
  {},
  { httpApiStatus: 404 },
) {}

export class CustomFieldInvalid extends Schema.TaggedError<CustomFieldInvalid>()(
  "CustomFieldInvalid",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

/** Normalize a display label for filter matching across places. */
export const normalizeCustomFieldLabel = (label: string): string =>
  label.trim().toLowerCase().replace(/\s+/g, " ")

const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
/** Lenient http(s) URL check without relying on the DOM `URL` global (domain is ES-lib only). */
const urlOk = (value: string) => {
  const withScheme = value.includes("://") ? value : `https://${value}`
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(withScheme)
}
const phoneOk = (value: string) => value.replace(/[^\d+]/g, "").length >= 5
const numberOk = (value: string) => Number.isFinite(Number(value)) && value.trim() !== ""
const dateOk = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))

/** Validate and normalize a value for the given type. Returns a clean string or an error message. */
export const validateCustomFieldValue = (
  type: CustomFieldType,
  raw: string,
): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly message: string } => {
  const value = raw.trim()
  if (value.length === 0) return { ok: false, message: "Enter a value" }
  if (value.length > 2_000) return { ok: false, message: "Value is too long" }

  switch (type) {
    case "text":
      return { ok: true, value }
    case "email":
      return emailOk(value)
        ? { ok: true, value: value.toLowerCase() }
        : { ok: false, message: "Enter a valid email address" }
    case "url": {
      if (!urlOk(value)) return { ok: false, message: "Enter a valid URL" }
      return { ok: true, value: value.includes("://") ? value : `https://${value}` }
    }
    case "phone":
      return phoneOk(value)
        ? { ok: true, value }
        : { ok: false, message: "Enter a valid phone number" }
    case "number":
      return numberOk(value)
        ? { ok: true, value: String(Number(value)) }
        : { ok: false, message: "Enter a number" }
    case "date":
      return dateOk(value)
        ? { ok: true, value }
        : { ok: false, message: "Enter a date as YYYY-MM-DD" }
  }
}
