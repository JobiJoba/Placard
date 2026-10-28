import type { PlaceList } from "@placard/domain"
import { type FormEvent, useCallback, useState } from "react"
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

  const create = (event: FormEvent) => {
    event.preventDefault()
    if (creating) return
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
    setEditingId(list.id)
    setEditName(list.name)
    setEditDescription(list.description ?? "")
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
        setEditingId(null)
        setData((lists ?? []).map((item) => (item.id === updated.id ? updated : item)))
      },
      (cause: unknown) => setCreateError(errorMessage(cause)),
    )
  }

  const remove = (list: PlaceList) => {
    if (!window.confirm(`Delete list "${list.name}"? Places stay in your library.`)) return
    api((c) => c.lists.remove({ params: { id: list.id } })).then(
      () => reload(),
      (cause: unknown) => setCreateError(errorMessage(cause)),
    )
  }

  if (error) return <ErrorAlert message={error} />
  if (!lists) return <Skeleton className="h-40 rounded-xl" />

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Lists</h1>
        <p className="text-sm text-muted-foreground">
          Group places for a trip or theme. Tags are lighter labels; lists are collections you open
          from the library.
        </p>
      </div>

      {lists.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-xl bg-muted/40 px-4 py-8">
          <p className="text-sm text-muted-foreground">
            No lists yet. Create one — for example “Naples pizza” or “Weekend walks”.
          </p>
          <form onSubmit={create} className="flex flex-wrap items-end gap-3">
            <FieldGroup className="flex-1">
              <Field>
                <FieldLabel htmlFor="list-name">New list</FieldLabel>
                <Input
                  id="list-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  required
                  autoFocus
                />
              </Field>
            </FieldGroup>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </form>
        </div>
      ) : (
        <>
          <form onSubmit={create} className="flex flex-wrap items-end gap-3">
            <FieldGroup className="flex-1">
              <Field>
                <FieldLabel htmlFor="list-name">New list</FieldLabel>
                <Input
                  id="list-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  required
                />
              </Field>
            </FieldGroup>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </form>
          <ul className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">
            {lists.map((list) => (
              <li
                key={list.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                {editingId === list.id ? (
                  <div className="flex flex-1 flex-col gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      aria-label="List name"
                    />
                    <Input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Description (optional)"
                      aria-label="List description"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(list)}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-0.5">
                      <Link to={`/?list=${list.id}`} className="font-medium hover:underline">
                        {list.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {list.placeCount} place{list.placeCount === 1 ? "" : "s"}
                        {list.description ? ` · ${list.description}` : ""}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(list)}>
                        Rename
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(list)}>
                        Delete
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <ErrorAlert message={createError} />
    </section>
  )
}
