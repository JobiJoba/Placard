import type { MediaItem } from "@placard/domain"
import { Trash2 } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { ErrorAlert } from "@/components/error-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"

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

export function PlaceMediaSection({ placeId }: { readonly placeId: string }) {
  const {
    data: items,
    setData,
    error,
    reload,
  } = useLoad(useCallback(() => api((c) => c.media.list({ params: { placeId } })), [placeId]))

  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const onPick = async (list: FileList | null) => {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith("image/"))
    if (files.length === 0) return
    setUploading(true)
    setUploadError(null)
    setUploadProgress({ done: 0, total: files.length })
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!file) continue
        const contentBase64 = await fileToBase64(file)
        const item = await api((c) =>
          c.media.upload({
            params: { placeId },
            payload: {
              kind: "photo",
              caption: null,
              filename: file.name || "photo.jpg",
              mimeType: file.type || "image/jpeg",
              contentBase64,
            },
          }),
        )
        setData((prev) => [
          item,
          ...(prev ?? []).map((m) => (item.isCover ? { ...m, isCover: false } : m)),
        ])
        setUploadProgress({ done: i + 1, total: files.length })
      }
      if (inputRef.current) inputRef.current.value = ""
    } catch (cause) {
      setUploadError(errorMessage(cause))
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }

  const remove = (id: string) => {
    void api((c) => c.media.remove({ params: { id } })).then(
      () => reload(),
      (cause: unknown) => setUploadError(errorMessage(cause)),
    )
  }

  const saveCaption = (id: string, next: string | null) => {
    void api((c) => c.media.update({ params: { id }, payload: { caption: next } })).then(
      (item) => setData((prev) => (prev ?? []).map((m) => (m.id === id ? item : m))),
      (cause: unknown) => setUploadError(errorMessage(cause)),
    )
  }

  const setCover = (id: string) => {
    void api((c) => c.media.setCover({ params: { id } })).then(
      (item) =>
        setData((prev) =>
          (prev ?? []).map((m) => ({
            ...m,
            isCover: m.id === item.id,
          })),
        ),
      (cause: unknown) => setUploadError(errorMessage(cause)),
    )
  }

  const addLabel =
    uploading && uploadProgress
      ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
      : uploading
        ? "Uploading…"
        : "Add photos"

  return (
    <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="place-media-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="place-media-heading" className="text-lg font-medium">
            Photos
          </h2>
          <p className="text-sm text-muted-foreground">Pictures that stay with this place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-8"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {addLabel}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => void onPick(e.target.files)}
          />
        </div>
      </div>

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
              onSetCover={() => setCover(item.id)}
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
  onSetCover,
}: {
  readonly item: MediaItem
  readonly onRemove: () => void
  readonly onCaption: (caption: string | null) => void
  readonly onSetCover: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [draft, setDraft] = useState(item.caption ?? "")
  const src = item.thumbUrl ?? item.url

  return (
    <li className="flex flex-col gap-2">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        <img
          src={src}
          alt={item.caption ?? "Photo"}
          className="size-full object-cover"
          loading="lazy"
        />
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {item.origin === "google" && <Badge variant="outline">Google</Badge>}
          {item.isCover && <Badge>Cover</Badge>}
        </div>
        {confirmRemove ? (
          <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-[color-mix(in_srgb,var(--crate)_70%,transparent)] p-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="min-h-11 flex-1 sm:min-h-8"
              onClick={onRemove}
            >
              Delete
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="min-h-11 flex-1 sm:min-h-8"
              onClick={() => setConfirmRemove(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-[color-mix(in_srgb,var(--crate)_55%,transparent)] p-2">
            {!item.isCover && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="min-h-11 flex-1 sm:min-h-8"
                onClick={onSetCover}
              >
                Set cover
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-11 shrink-0 sm:size-8"
              aria-label="Remove photo"
              onClick={() => setConfirmRemove(true)}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
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
