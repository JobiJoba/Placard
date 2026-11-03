import type { Place, PlaceCategory, PlaceList, PlaceStatus } from "@placard/domain"
import { type FormEvent, useEffect, useState } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import { api, errorMessage } from "@/lib/api"
import { usePlaceCategories } from "@/lib/place-categories"
import { categoryLabel } from "@/lib/places"

export function EditPlace({
  place,
  lists,
  onSaved,
  onCancel,
}: {
  readonly place: Place
  readonly lists: ReadonlyArray<PlaceList>
  readonly onSaved: (place: Place) => void
  readonly onCancel: () => void
}) {
  const [name, setName] = useState(place.name)
  const placeCategories = usePlaceCategories()
  const [category, setCategory] = useState<PlaceCategory>(place.category)
  const [address, setAddress] = useState(place.address ?? "")
  const [notes, setNotes] = useState(place.notes ?? "")
  const [phone, setPhone] = useState(place.facts.phone ?? "")
  const [status, setStatus] = useState<PlaceStatus | "none">(place.status ?? "none")
  const [tagNames, setTagNames] = useState(place.tags.map((t) => t.name).join(", "))
  const [listIds, setListIds] = useState<ReadonlySet<string>>(new Set(place.listIds))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(place.name)
    setCategory(place.category)
    setAddress(place.address ?? "")
    setNotes(place.notes ?? "")
    setPhone(place.facts.phone ?? "")
    setStatus(place.status ?? "none")
    setTagNames(place.tags.map((t) => t.name).join(", "))
    setListIds(new Set(place.listIds))
  }, [place])

  const toggleList = (listId: string) =>
    setListIds((prev) => {
      const next = new Set(prev)
      if (next.has(listId)) next.delete(listId)
      else next.add(listId)
      return next
    })

  const save = (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const names = tagNames
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
    const phoneValue = phone.trim() || null
    void (async () => {
      try {
        await api((c) =>
          c.places.update({
            params: { id: place.id },
            payload: {
              name,
              category,
              address: address.trim() || null,
              notes: notes.trim() || null,
              status: status === "none" ? null : status,
            },
          }),
        )
        await api((c) =>
          c.places.setFact({
            params: { id: place.id, key: "phone" },
            payload: { value: phoneValue },
          }),
        )
        await api((c) => c.places.setTags({ params: { id: place.id }, payload: { names } }))
        const next = await api((c) =>
          c.places.setLists({
            params: { id: place.id },
            payload: { listIds: [...listIds] },
          }),
        )
        onSaved(next)
        setSaving(false)
      } catch (cause) {
        setError(errorMessage(cause))
        setSaving(false)
      }
    })()
  }

  return (
    <form
      onSubmit={save}
      className="filter-sheet flex flex-col gap-4 rounded-md p-4"
      aria-labelledby="place-edit-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="place-edit-heading" className="text-lg font-medium">
          Edit
        </h2>
        <p className="text-xs text-muted-foreground">
          Your phone number survives a refresh from Google.
        </p>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="place-name">Name</FieldLabel>
          <Input id="place-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="place-category">Type</FieldLabel>
          <Select value={category} onValueChange={(v) => setCategory(v as PlaceCategory)}>
            <SelectTrigger id="place-category" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([...placeCategories, place.category])].map((value) => (
                <SelectItem key={value} value={value}>
                  {categoryLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="place-status">Status</FieldLabel>
          <Select value={status} onValueChange={(v) => setStatus(v as PlaceStatus | "none")}>
            <SelectTrigger id="place-status" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No status</SelectItem>
              <SelectItem value="want_to_go">Want to go</SelectItem>
              <SelectItem value="been_there">Been there</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="place-address">Address</FieldLabel>
          <Input id="place-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="place-phone">Phone</FieldLabel>
          <Input
            id="place-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Not set"
            className="max-w-xs"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="place-notes">Notes</FieldLabel>
          <Textarea
            id="place-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="place-tags">Tags</FieldLabel>
          <Input
            id="place-tags"
            value={tagNames}
            onChange={(e) => setTagNames(e.target.value)}
            placeholder="date-night, pizza"
          />
          <p className="text-xs text-muted-foreground">Comma-separated. New names create tags.</p>
        </Field>
        {lists.length > 0 && (
          <Field>
            <FieldLabel>Lists</FieldLabel>
            <ul className="flex flex-col gap-2">
              {lists.map((list) => (
                <li key={list.id} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
                  <input
                    type="checkbox"
                    id={`list-${list.id}`}
                    checked={listIds.has(list.id)}
                    onChange={() => toggleList(list.id)}
                    className="size-4"
                  />
                  <label htmlFor={`list-${list.id}`}>{list.name}</label>
                </li>
              ))}
            </ul>
          </Field>
        )}
      </FieldGroup>
      <ErrorAlert message={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11 w-fit sm:min-h-8" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 sm:min-h-8"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
