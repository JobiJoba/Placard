import { useMe } from "@/session"

export function LibraryPage() {
  const me = useMe()
  return (
    <section className="flex flex-col gap-3 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Your library is empty</h1>
      <p className="mx-auto max-w-md text-muted-foreground">
        Welcome, {me.name}. Places you save will show up here, and only you can see them.
      </p>
    </section>
  )
}
