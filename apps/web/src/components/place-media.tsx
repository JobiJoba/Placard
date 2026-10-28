import type { MediaItem, MediaKind, PlaceCategory } from "@placard/domain"
import { ImagePlus, Trash2, UtensilsCrossed } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { ErrorAlert } from "@/components/error-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"

const kindLabel: Record<MediaKind, string> = {
  dish: "Dish",
  photo: "Photo",
  attachment: "File",
}

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Could not read file."))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== "string") {
        reject(new Error("Could not read file."))
        return
      }
      const comma = result.indexOf(",")
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(file)
  })

export function PlaceMediaSection({
  placeId,
  category,
}: {
  readonly placeId: string
  readonly category: PlaceCategory
}) {
  const {
    data: items,
    setData,
    error,
    reload,
  } = useLoad(useCallback(() => api((c) => c.media.list({ params: { placeId } })), [placeId]))

  const defaultKind: MediaKind = category === "restaurant" || category === "cafe" ? "dish" : "photo"
  const [kind, setKind] = useState<MediaKind>(defaultKind)
  const [caption, setCaption] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const onPick = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const contentBase64 = await fileToBase64(file)
      const item = await api((c) =>
        c.media.upload({
          params: { placeId },
          payload: {
            kind,
            caption: caption.trim() === "" ? null : caption.trim(),
            filename: file.name || "photo.jpg",
            mimeType: file.type || "image/jpeg",
            contentBase64,
          },
        }),
      )
      setData((prev) => [item, ...(prev ?? [])])
      setCaption("")
      if (inputRef.current) inputRef.current.value = ""
    } catch (cause) {
      setUploadError(errorMessage(cause))
    } finally {
      setUploading(false)
    }
  }

  const remove = (id: string) => {
    void api((c) => c.media.remove({ params: { id } })).then(
      () => setData((prev) => (prev ?? []).filter((m) => m.id !== id)),
      (cause: unknown) => setUploadError(errorMessage(cause)),
    )
  }

  const saveCaption = (id: string, next: string | null) => {
    void api((c) => c.media.update({ params: { id }, payload: { caption: next } })).then(
      (item) => setData((prev) => (prev ?? []).map((m) => (m.id === id ? item : m))),
      (cause: unknown) => setUploadError(errorMessage(cause)),
    )
  }

  return (
    <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="place-media-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="place-media-heading" className="text-lg font-medium">
            Photos
          </h2>
          <p className="text-sm text-muted-foreground">
            Dish shots and memories stay with this place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md ring-1 ring-foreground/10">
            {(["dish", "photo"] as const).map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={kind === k ? "secondary" : "ghost"}
                className="rounded-none first:rounded-l-md last:rounded-r-md"
                onClick={() => setKind(k)}
              >
                {k === "dish" ? <UtensilsCrossed aria-hidden /> : <ImagePlus aria-hidden />}
                {kindLabel[k]}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Uploading…" : "Add photo"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
        </div>
      </div>

      <Field>
        <FieldLabel htmlFor="media-caption">Caption (optional)</FieldLabel>
        <Input
          id="media-caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={kind === "dish" ? "e.g. Margherita" : "What is this?"}
          maxLength={500}
        />
      </Field>

      <ErrorAlert message={uploadError ?? error} />

      {items === null && !error ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Skeleton className="aspect-square rounded-lg" />
          <Skeleton className="aspect-square rounded-lg" />
        </div>
      ) : items && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photos yet.</p>
      ) : items ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <MediaTile
              key={item.id}
              item={item}
              onRemove={() => remove(item.id)}
              onCaption={(value) => saveCaption(item.id, value)}
            />
          ))}
        </ul>
      ) : null}

      {error && (
        <Button type="button" variant="outline" size="sm" onClick={() => reload()}>
          Retry
        </Button>
      )}
    </section>
  )
}

function MediaTile({
  item,
  onRemove,
  onCaption,
}: {
  readonly item: MediaItem
  readonly onRemove: () => void
  readonly onCaption: (caption: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [draft, setDraft] = useState(item.caption ?? "")
  const src = item.thumbUrl ?? item.url

  return (
    <li className="group flex flex-col gap-2">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        <img
          src={src}
          alt={item.caption ?? kindLabel[item.kind]}
          className="size-full object-cover"
          loading="lazy"
        />
        <div className="absolute top-2 left-2">
          <Badge variant="secondary">{kindLabel[item.kind]}</Badge>
        </div>
        {confirmRemove ? (
          <div className="absolute inset-x-2 bottom-2 flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={onRemove}
            >
              Delete
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => setConfirmRemove(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            className="absolute top-2 right-2"
            aria-label="Remove photo"
            onClick={() => setConfirmRemove(true)}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
      {editing ? (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            const next = draft.trim()
            onCaption(next === "" ? null : next)
            setEditing(false)
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            autoFocus
            aria-label="Caption"
          />
          <Button type="submit" size="sm" variant="secondary">
            Save
          </Button>
        </form>
      ) : (
        <button
          type="button"
          className="text-left text-sm text-muted-foreground hover:text-foreground"
          onClick={() => {
            setDraft(item.caption ?? "")
            setEditing(true)
          }}
        >
          {item.caption ?? "Add caption"}
        </button>
      )}
    </li>
  )
}
