import { cn } from "@/lib/utils"

export function UserAvatar({
  name,
  image,
  className,
}: {
  readonly name: string
  readonly image: string | null
  readonly className?: string
}) {
  const initial = (name.trim().charAt(0) || "?").toUpperCase()
  if (image) {
    return (
      <img
        src={image}
        alt=""
        className={cn("size-7 shrink-0 rounded-sm object-cover ring-1 ring-border", className)}
      />
    )
  }
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-sm bg-muted font-catalog text-sm font-semibold uppercase tracking-[0.04em] text-foreground ring-1 ring-border",
        className,
      )}
      aria-hidden
    >
      {initial}
    </span>
  )
}
