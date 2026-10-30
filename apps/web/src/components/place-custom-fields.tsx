import {
  type CustomFieldType,
  customFieldTypes,
  type Place,
  type PlaceCustomField,
  validateCustomFieldValue,
} from "@placard/domain"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { type FormEvent, useState } from "react"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api, errorMessage } from "@/lib/api"

const typeLabels: Record<CustomFieldType, string> = {
  text: "Text",
  email: "Email",
  url: "URL",
  phone: "Phone",
  number: "Number",
  date: "Date",
}

const inputTypeFor = (type: CustomFieldType): string => {
  switch (type) {
    case "email":
      return "email"
    case "url":
      return "url"
    case "phone":
      return "tel"
    case "number":
      return "number"
    case "date":
      return "date"
    case "text":
      return "text"
  }
}

const formatDisplayValue = (field: PlaceCustomField): { href?: string; text: string } => {
  switch (field.type) {
    case "email":
      return { href: `mailto:${field.value}`, text: field.value }
    case "url":
      return {
        href: field.value,
        text: field.value.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      }
    case "phone":
      return { href: `tel:${field.value.replace(/[^\d+]/g, "")}`, text: field.value }
    case "date": {
      const parsed = Date.parse(field.value)
      if (Number.isNaN(parsed)) return { text: field.value }
      return {
        text: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(parsed)),
      }
    }
    case "number":
    case "text":
      return { text: field.value }
  }
}

export function PlaceCustomFieldsSection({
  place,
  onChanged,
  readOnly = false,
}: {
  readonly place: Place
  readonly onChanged: (place: Place) => void
  readonly readOnly?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const remove = (fieldId: string) => {
    setBusy(true)
    setError(null)
    void api((c) => c.places.removeCustomField({ params: { id: place.id, fieldId } })).then(
      (next) => {
        onChanged(next)
        setConfirmDeleteId(null)
        setBusy(false)
      },
      (cause: unknown) => {
        setError(errorMessage(cause))
        setBusy(false)
      },
    )
  }

  return (
    <section
      className="flex flex-col gap-4 border-t pt-6"
      aria-labelledby="place-more-info-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="place-more-info-heading" className="text-lg font-medium">
          More info
        </h2>
        {!readOnly && !adding && editingId == null ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-8"
            onClick={() => {
              setAdding(true)
              setEditingId(null)
              setConfirmDeleteId(null)
            }}
          >
            <Plus aria-hidden /> Add field
          </Button>
        ) : null}
      </div>

      <ErrorAlert message={error} />

      {place.customFields.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? "No extra fields on this place."
            : "Add email, Instagram, open date, or any other detail you want on this card."}
        </p>
      ) : null}

      {place.customFields.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {place.customFields.map((field) =>
            editingId === field.id ? (
              <li key={field.id}>
                <FieldEditor
                  placeId={place.id}
                  initial={field}
                  busy={busy}
                  onBusy={setBusy}
                  onError={setError}
                  onSaved={(next) => {
                    onChanged(next)
                    setEditingId(null)
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={field.id} className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {field.label}
                    <span className="ml-2 font-normal normal-case tracking-normal opacity-70">
                      {typeLabels[field.type]}
                    </span>
                  </p>
                  {(() => {
                    const display = formatDisplayValue(field)
                    return display.href ? (
                      <a
                        href={display.href}
                        target={field.type === "url" ? "_blank" : undefined}
                        rel={field.type === "url" ? "noreferrer" : undefined}
                        className="break-all text-sm underline underline-offset-2"
                      >
                        {display.text}
                      </a>
                    ) : (
                      <p className="break-words text-sm">{display.text}</p>
                    )
                  })()}
                </div>
                <div className="flex shrink-0 gap-1">
                  {readOnly ? null : confirmDeleteId === field.id ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="min-h-11 sm:min-h-8"
                        disabled={busy}
                        onClick={() => remove(field.id)}
                      >
                        Delete
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-11 sm:min-h-8"
                        disabled={busy}
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-11 sm:size-8"
                        aria-label={`Edit ${field.label}`}
                        onClick={() => {
                          setEditingId(field.id)
                          setAdding(false)
                          setConfirmDeleteId(null)
                        }}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-11 sm:size-8"
                        aria-label={`Delete ${field.label}`}
                        onClick={() => setConfirmDeleteId(field.id)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      ) : null}

      {adding ? (
        <FieldEditor
          placeId={place.id}
          busy={busy}
          onBusy={setBusy}
          onError={setError}
          onSaved={(next) => {
            onChanged(next)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}
    </section>
  )
}

function FieldEditor({
  placeId,
  initial,
  busy,
  onBusy,
  onError,
  onSaved,
  onCancel,
}: {
  readonly placeId: string
  readonly initial?: PlaceCustomField
  readonly busy: boolean
  readonly onBusy: (busy: boolean) => void
  readonly onError: (message: string | null) => void
  readonly onSaved: (place: Place) => void
  readonly onCancel: () => void
}) {
  const [label, setLabel] = useState(initial?.label ?? "")
  const [type, setType] = useState<CustomFieldType>(initial?.type ?? "text")
  const [value, setValue] = useState(initial?.value ?? "")
  const [localError, setLocalError] = useState<string | null>(null)

  const save = (event: FormEvent) => {
    event.preventDefault()
    const checked = validateCustomFieldValue(type, value)
    if (!label.trim()) {
      setLocalError("Give the field a label")
      return
    }
    if (!checked.ok) {
      setLocalError(checked.message)
      return
    }
    setLocalError(null)
    onError(null)
    onBusy(true)
    const payload = { label: label.trim(), type, value: checked.value }
    const request = initial
      ? api((c) =>
          c.places.updateCustomField({
            params: { id: placeId, fieldId: initial.id },
            payload,
          }),
        )
      : api((c) => c.places.addCustomField({ params: { id: placeId }, payload }))
    void request.then(
      (next) => {
        onSaved(next)
        onBusy(false)
      },
      (cause: unknown) => {
        onError(errorMessage(cause))
        onBusy(false)
      },
    )
  }

  return (
    <form onSubmit={save} className="filter-sheet flex flex-col gap-3 rounded-md p-3">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="custom-field-label">Label</FieldLabel>
          <Input
            id="custom-field-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Instagram, Opened, Email"
            maxLength={80}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="custom-field-type">Type</FieldLabel>
          <Select value={type} onValueChange={(v) => setType(v as CustomFieldType)}>
            <SelectTrigger id="custom-field-type" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {customFieldTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {typeLabels[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="custom-field-value">Value</FieldLabel>
          <Input
            id="custom-field-value"
            type={inputTypeFor(type)}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              type === "email"
                ? "name@example.com"
                : type === "url"
                  ? "https://"
                  : type === "date"
                    ? "YYYY-MM-DD"
                    : undefined
            }
            required
          />
        </Field>
      </FieldGroup>
      {localError ? <p className="text-sm text-destructive">{localError}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11 sm:min-h-8" disabled={busy}>
          {busy ? "Saving…" : initial ? "Save field" : "Add field"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 sm:min-h-8"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
