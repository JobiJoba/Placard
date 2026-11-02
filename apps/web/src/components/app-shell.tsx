import type { MyModule } from "@placard/domain"
import { ChevronDown, Library, List, Menu, Plus, Puzzle, Search, Settings } from "lucide-react"
import { DynamicIcon, dynamicIconImports } from "lucide-react/dynamic"
import { useEffect, useMemo, useState } from "react"
import { Link, NavLink, Outlet, useLocation } from "react-router"
import { CommandPalette } from "@/components/command-palette"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/user-avatar"
import { cn } from "@/lib/utils"
import { useMe, useSession } from "@/session"

const corePrimary = [
  { to: "/", label: "Library", end: true },
  { to: "/lists", label: "Lists" },
] as const

const collectPrimary = { to: "/add", label: "Add" } as const

const more = [
  { to: "/import", label: "Import" },
  { to: "/deleted", label: "Recently deleted" },
  { to: "/settings", label: "Settings" },
] as const

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-sm px-2.5 py-1.5 font-catalog text-sm font-semibold uppercase tracking-[0.06em] transition-colors",
    isActive
      ? "bg-[color-mix(in_srgb,var(--spine-gold)_22%,transparent)] text-[var(--parchment)]"
      : "text-[color-mix(in_srgb,var(--parchment)_72%,transparent)] hover:bg-[color-mix(in_srgb,var(--parchment)_6%,transparent)] hover:text-[var(--parchment)]",
  )

const bottomLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors",
    isActive
      ? "text-[var(--spine-gold)]"
      : "text-[color-mix(in_srgb,var(--parchment)_65%,transparent)]",
  )

/** Ghost buttons on crate chrome — kill light muted expanded/focus from the base Button. */
const crateGhost =
  "text-[var(--parchment)] hover:bg-[var(--crate-raised)] hover:text-[var(--parchment)] focus-visible:bg-[var(--crate-raised)] focus-visible:text-[var(--parchment)] aria-expanded:bg-[var(--crate-raised)] aria-expanded:text-[var(--parchment)] data-[state=open]:bg-[var(--crate-raised)] data-[state=open]:text-[var(--parchment)]"

function pathMatches(pathname: string, to: string) {
  if (to === "/") return pathname === "/"
  return pathname === to || pathname.startsWith(`${to}/`)
}

function ModuleImageIcon({ iconUrl }: { readonly iconUrl: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (!iconUrl || failedUrl === iconUrl) return <Puzzle size={19} aria-hidden />
  return (
    <img
      src={iconUrl}
      alt=""
      className="size-[19px] shrink-0 object-contain"
      onError={() => setFailedUrl(iconUrl)}
    />
  )
}

function ModuleNavIcon({
  mobileIcon,
  iconUrl,
}: {
  readonly mobileIcon: string | undefined
  readonly iconUrl: string | null
}) {
  if (mobileIcon && Object.hasOwn(dynamicIconImports, mobileIcon)) {
    return (
      <DynamicIcon
        key={mobileIcon}
        name={mobileIcon as keyof typeof dynamicIconImports}
        size={19}
        aria-hidden
        fallback={() => <ModuleImageIcon iconUrl={iconUrl} />}
      />
    )
  }
  return <ModuleImageIcon iconUrl={iconUrl} />
}

export function AppShell({ modules }: { readonly modules: ReadonlyArray<MyModule> }) {
  const me = useMe()
  const { signOut } = useSession()
  const location = useLocation()
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
          iconUrl: m.iconUrl,
          mobileIcon: item.mobileIcon,
        }))
      : [],
  )
  const primaryPlugins = pluginNav.filter((p) => p.slot === "primary")
  const morePlugins = pluginNav.filter((p) => p.slot === "more")

  const moreItems = useMemo(
    () => [...more, ...morePlugins.map((p) => ({ to: p.to, label: p.label }))],
    [morePlugins],
  )
  const moreActive = moreItems.some((item) => pathMatches(location.pathname, item.to))
  return (
    <div className="app-shell flex min-h-dvh min-w-0 flex-col overflow-x-hidden bg-[var(--parchment)]">
      <a href="#main-content" className="app-skip-link">
        Skip to content
      </a>
      <header className="app-header sticky top-0 z-40 border-b border-[var(--crate-edge)] bg-[var(--crate)] text-[var(--parchment)] shadow-[inset_0_-1px_0_color-mix(in_srgb,var(--spine-gold)_22%,transparent)]">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:gap-4 sm:px-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 font-catalog shrink-0 truncate text-xl font-semibold uppercase tracking-[0.04em] text-[var(--parchment)] sm:text-2xl"
          >
            <img src="/favicon.svg" width={32} height={32} alt="" />
            Placard
          </Link>

          <div
            className="hidden h-7 w-px shrink-0 bg-[color-mix(in_srgb,var(--spine-gold)_35%,var(--crate-edge))] md:block"
            aria-hidden
          />

          <nav
            className="hidden min-w-0 items-center gap-0.5 rounded-sm bg-[var(--crate-raised)] p-0.5 ring-1 ring-[var(--crate-edge)] md:flex"
            aria-label="Main"
          >
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
                  aria-current={moreActive ? "true" : undefined}
                  className={cn(
                    navLink({ isActive: moreActive }),
                    "h-auto gap-1 font-normal hover:bg-[color-mix(in_srgb,var(--parchment)_12%,transparent)] hover:text-[var(--parchment)] aria-expanded:bg-[color-mix(in_srgb,var(--spine-gold)_32%,transparent)] aria-expanded:text-[var(--parchment)] data-[state=open]:bg-[color-mix(in_srgb,var(--spine-gold)_32%,transparent)] data-[state=open]:text-[var(--parchment)]",
                  )}
                >
                  More
                  <ChevronDown className="size-3.5 opacity-70" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-48">
                {moreItems.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <Button
              asChild
              size="sm"
              className="hidden rounded-sm bg-[var(--action)] px-3 text-[var(--action-fg)] hover:bg-[color-mix(in_srgb,var(--action)_88%,black)] md:inline-flex"
            >
              <Link to={collectPrimary.to}>{collectPrimary.label}</Link>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "hidden h-8 gap-1.5 rounded-sm px-2 text-[color-mix(in_srgb,var(--parchment)_75%,transparent)] sm:inline-flex",
                crateGhost,
              )}
              onClick={() => setPaletteOpen(true)}
              aria-label="Commands"
            >
              <Search aria-hidden className="size-3.5" />
              <span className="hidden font-catalog text-xs font-semibold uppercase tracking-[0.06em] lg:inline">
                Commands
              </span>
              <kbd className="pointer-events-none hidden rounded-sm border border-[var(--crate-edge)] px-1.5 py-0.5 font-mono text-xs leading-none text-[color-mix(in_srgb,var(--parchment)_70%,transparent)] md:inline">
                ⌘K
              </kbd>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={cn("rounded-sm sm:hidden", crateGhost)}
              onClick={() => setPaletteOpen(true)}
              aria-label="Commands"
            >
              <Search aria-hidden />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn("hidden h-8 gap-1.5 rounded-sm px-1.5 md:inline-flex", crateGhost)}
                  aria-label={`Account menu for ${me.name}`}
                >
                  <UserAvatar
                    name={me.name}
                    image={me.image}
                    className="bg-[var(--crate-raised)] text-[var(--parchment)] ring-[var(--crate-edge)]"
                  />
                  <ChevronDown className="size-3.5 opacity-60" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{me.name}</span>
                    <span className="text-xs text-muted-foreground">{me.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn("rounded-sm md:hidden", crateGhost)}
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
                <DropdownMenuItem asChild>
                  <Link to={collectPrimary.to}>{collectPrimary.label}</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {moreItems.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setPaletteOpen(true)}>Commands…</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main
        id="main-content"
        className="app-content mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-8 md:pb-16"
      >
        <Outlet />
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--crate-edge)] bg-[var(--crate)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Primary"
      >
        <div className="mx-auto flex max-w-7xl">
          <NavLink to="/" end className={bottomLink}>
            <Library size={19} aria-hidden />
            Library
          </NavLink>
          {primaryPlugins[0] ? (
            <NavLink to={primaryPlugins[0].to} className={bottomLink}>
              <ModuleNavIcon
                mobileIcon={primaryPlugins[0].mobileIcon}
                iconUrl={primaryPlugins[0].iconUrl}
              />
              <span className="max-w-16 truncate">{primaryPlugins[0].label}</span>
            </NavLink>
          ) : null}
          <NavLink to="/lists" className={bottomLink}>
            <List size={19} aria-hidden />
            Lists
          </NavLink>
          <NavLink to="/add" className={bottomLink}>
            <Plus size={19} aria-hidden />
            Add
          </NavLink>
          {primaryPlugins[0] ? null : (
            <NavLink to="/settings" className={bottomLink}>
              <Settings size={19} aria-hidden />
              Settings
            </NavLink>
          )}
        </div>
      </nav>
      <CommandPalette modules={modules} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
