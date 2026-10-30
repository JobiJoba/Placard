import type { MyModule } from "@placard/domain"
import { Menu, Search } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, NavLink, Outlet } from "react-router"
import { CommandPalette } from "@/components/command-palette"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useMe, useSession } from "@/session"

const corePrimary = [{ to: "/", label: "Library", end: true }] as const

const more = [
  { to: "/add", label: "Add" },
  { to: "/import", label: "Import" },
  { to: "/lists", label: "Lists" },
  { to: "/deleted", label: "Recently deleted" },
  { to: "/settings", label: "Settings" },
] as const

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-sm px-2.5 py-1.5 text-sm transition-colors",
    isActive
      ? "bg-[color-mix(in_srgb,var(--spine-gold)_22%,transparent)] text-[var(--parchment)]"
      : "text-[color-mix(in_srgb,var(--parchment)_72%,transparent)] hover:text-[var(--parchment)]",
  )

const bottomLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors",
    isActive
      ? "text-[var(--spine-gold)]"
      : "text-[color-mix(in_srgb,var(--parchment)_65%,transparent)]",
  )

export function AppShell({ modules }: { readonly modules: ReadonlyArray<MyModule> }) {
  const me = useMe()
  const { signOut } = useSession()
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k") return
      if (!(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setPaletteOpen((open) => !open)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const pluginNav = modules.flatMap((m) =>
    m.visible
      ? m.nav.map((item) => ({
          to: item.path,
          label: item.label,
          slot: item.slot,
        }))
      : [],
  )
  const primaryPlugins = pluginNav.filter((p) => p.slot === "primary")
  const morePlugins = pluginNav.filter((p) => p.slot === "more")

  return (
    <div className="flex min-h-dvh min-w-0 flex-col overflow-x-hidden bg-[var(--parchment)]">
      <header className="sticky top-0 z-40 border-b border-[var(--crate-edge)] bg-[var(--crate)] text-[var(--parchment)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <Link
              to="/"
              className="font-catalog truncate text-xl font-semibold uppercase tracking-[0.04em] text-[var(--parchment)] sm:text-2xl"
            >
              Placard
            </Link>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
              {corePrimary.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={"end" in item ? item.end : false}
                  className={navLink}
                >
                  {item.label}
                </NavLink>
              ))}
              {primaryPlugins.map((item) => (
                <NavLink key={item.to} to={item.to} className={navLink}>
                  {item.label}
                </NavLink>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto rounded-sm px-2.5 py-1.5 text-sm font-normal text-[color-mix(in_srgb,var(--parchment)_72%,transparent)] hover:bg-transparent hover:text-[var(--parchment)]"
                  >
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-48">
                  {more.map((item) => (
                    <DropdownMenuItem key={item.to} asChild>
                      <Link to={item.to}>{item.label}</Link>
                    </DropdownMenuItem>
                  ))}
                  {morePlugins.length > 0 ? <DropdownMenuSeparator /> : null}
                  {morePlugins.map((item) => (
                    <DropdownMenuItem key={item.to} asChild>
                      <Link to={item.to}>{item.label}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden border-[var(--crate-edge)] bg-transparent text-[var(--parchment)] hover:bg-[var(--crate-raised)] hover:text-[var(--parchment)] sm:inline-flex"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search and commands"
            >
              <Search aria-hidden />
              <span className="hidden lg:inline">Search</span>
              <kbd className="pointer-events-none hidden rounded border border-[var(--crate-edge)] px-1.5 py-0.5 font-mono text-[0.65rem] text-[color-mix(in_srgb,var(--parchment)_70%,transparent)] md:inline">
                ⌘K
              </kbd>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="border-[var(--crate-edge)] bg-transparent text-[var(--parchment)] hover:bg-[var(--crate-raised)] sm:hidden"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search and commands"
            >
              <Search aria-hidden />
            </Button>
            <span className="hidden text-sm text-[color-mix(in_srgb,var(--parchment)_70%,transparent)] lg:inline">
              {me.name}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="hidden border-[var(--crate-edge)] bg-transparent text-[var(--parchment)] hover:bg-[var(--crate-raised)] hover:text-[var(--parchment)] sm:inline-flex"
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="border-[var(--crate-edge)] bg-transparent text-[var(--parchment)] hover:bg-[var(--crate-raised)] md:hidden"
                  aria-label="Menu"
                >
                  <Menu aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                {corePrimary.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
                {primaryPlugins.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                {more.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
                {morePlugins.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setPaletteOpen(true)}>Search…</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-8 md:pb-16">
        <Outlet />
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--crate-edge)] bg-[var(--crate)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Primary"
      >
        <div className="mx-auto flex max-w-6xl">
          <NavLink to="/" end className={bottomLink}>
            Library
          </NavLink>
          {primaryPlugins[0] ? (
            <NavLink to={primaryPlugins[0].to} className={bottomLink}>
              <span className="max-w-16 truncate">{primaryPlugins[0].label}</span>
            </NavLink>
          ) : null}
          <NavLink to="/add" className={bottomLink}>
            Add
          </NavLink>
          <NavLink to="/settings" className={bottomLink}>
            Settings
          </NavLink>
        </div>
      </nav>
      <CommandPalette modules={modules} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
