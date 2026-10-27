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
  const [createError, setCreateError] = useState<string | null>(null)

  const create = (event: FormEvent) => {
    event.preventDefault()
    setCreateError(null)
    api((c) => c.lists.create({ payload: { name, description: null } })).then(
      (created) => {
        setName("")
        setData([...(lists ?? []), created].sort((a, b) => a.name.localeCompare(b.name)))
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
      <h1 className="text-3xl font-semibold tracking-tight">Lists</h1>
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
        <Button type="submit">Create</Button>
      </form>
      <ErrorAlert message={createError} />
      {lists.length === 0 ? (
        <p className="text-sm text-muted-foreground">No lists yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">
          {lists.map((list) => (
            <li key={list.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <Link to={`/?list=${list.id}`} className="font-medium hover:underline">
                  {list.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {list.placeCount} place{list.placeCount === 1 ? "" : "s"}
                  {list.description ? ` · ${list.description}` : ""}
                </span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove(list)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
