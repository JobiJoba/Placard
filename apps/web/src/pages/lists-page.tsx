import type { PlaceList } from "@placard/domain"
import { type FormEvent, type KeyboardEvent, useCallback, useState } from "react"
import { Link } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"

export function ListsPage() {
  const {
    data: lists,
    error,
    reload,
    setData,
  } = useLoad(useCallback(() => api((c) => c.lists.list()), []))
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const create = (event: FormEvent) => {
    event.preventDefault()
    if (creating || editingId) return
    setCreateError(null)
    setCreating(true)
    api((c) => c.lists.create({ payload: { name, description: null } })).then(
      (created) => {
        setName("")
        setCreating(false)
        setData([...(lists ?? []), created].sort((a, b) => a.name.localeCompare(b.name)))
      },
      (cause: unknown) => {
        setCreateError(errorMessage(cause))
        setCreating(false)
      },
    )
  }

  const startEdit = (list: PlaceList) => {
    setDeletingId(null)
    setEditingId(list.id)
    setEditName(list.name)
    setEditDescription(list.description ?? "")
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName("")
    setEditDescription("")
  }

  const saveEdit = (list: PlaceList) => {
    setCreateError(null)
    api((c) =>
      c.lists.update({
        params: { id: list.id },
        payload: {
          name: editName.trim(),
          description: editDescription.trim() || null,
        },
      }),
    ).then(
      (updated) => {
        cancelEdit()
        setData((lists ?? []).map((item) => (item.id === updated.id ? updated : item)))
      },
      (cause: unknown) => setCreateError(errorMessage(cause)),
    )
  }

  const onEditKeyDown = (event: KeyboardEvent, list: PlaceList) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      saveEdit(list)
    }
    if (event.key === "Escape") {
      event.preventDefault()
      cancelEdit()
    }
  }

  const remove = (list: PlaceList) => {
    setCreateError(null)
    setDeleting(true)
    api((c) => c.lists.remove({ params: { id: list.id } })).then(
      () => {
        setDeletingId(null)
        setDeleting(false)
        reload()
      },
      (cause: unknown) => {
        setCreateError(errorMessage(cause))
        setDeleting(false)
      },
    )
  }

  if (error) return <ErrorAlert message={error} />
  if (!lists) return <Skeleton className="h-40 rounded-sm" />

  const isEmpty = lists.length === 0
  const showCreate = !editingId

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-catalog text-4xl font-semibold tracking-wide uppercase sm:text-5xl">
          Lists
        </h1>
        {isEmpty ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            Group places for a trip or theme. Tags are lighter labels; lists are collections you
            open from the library.
          </p>
        ) : null}
      </div>

      {showCreate ? (
        <form
          onSubmit={create}
          className={
            isEmpty
              ? "flex flex-col gap-4 rounded-sm border border-[var(--crate-edge)]/25 bg-[color-mix(in_srgb,var(--crate)_4%,transparent)] px-4 py-6"
              : "flex flex-wrap items-end gap-3"
          }
        >
          {isEmpty ? (
            <p className="text-sm text-muted-foreground">
              No lists yet. Create one — for example “Naples pizza” or “Weekend walks”.
            </p>
          ) : null}
          <div className="flex w-full flex-wrap items-end gap-3">
            <FieldGroup className="min-w-48 flex-1">
              <Field>
                <FieldLabel htmlFor="list-name">New list</FieldLabel>
                <Input
                  id="list-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  required
                  autoFocus={isEmpty}
                />
              </Field>
            </FieldGroup>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      ) : null}

      {!isEmpty ? (
        <ul className="flex flex-col divide-y divide-[var(--crate-edge)]/20 rounded-sm border border-[var(--crate-edge)]/25">
          {lists.map((list) => (
            <li
              key={list.id}
              className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              {editingId === list.id ? (
                <div className="flex flex-1 flex-col gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => onEditKeyDown(e, list)}
                    aria-label="List name"
                    autoFocus
                  />
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    onKeyDown={(e) => onEditKeyDown(e, list)}
                    placeholder="Description (optional)"
                    aria-label="List description"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(list)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : deletingId === list.id ? (
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm">Delete “{list.name}”? Places stay in your library.</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deleting}
                      onClick={() => remove(list)}
                    >
                      {deleting ? "Deleting…" : "Delete list"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={deleting}
                      onClick={() => setDeletingId(null)}
                    >
                      Keep
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Link
                      to={`/?list=${list.id}`}
                      className="font-catalog text-lg font-semibold tracking-wide uppercase underline-offset-4 hover:underline focus-visible:underline"
                    >
                      {list.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {list.placeCount} place{list.placeCount === 1 ? "" : "s"}
                      {list.description ? ` · ${list.description}` : ""}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => startEdit(list)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => {
                        setEditingId(null)
                        setDeletingId(list.id)
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <ErrorAlert message={createError} />
    </section>
  )
}
