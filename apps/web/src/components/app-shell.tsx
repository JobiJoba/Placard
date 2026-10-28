import type { MyModule } from "@placard/domain"
import { Menu } from "lucide-react"
import { Link, NavLink, Outlet } from "react-router"
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
    <div className="flex min-h-screen flex-col bg-[var(--parchment)]">
      <header className="sticky top-0 z-40 border-b border-[var(--crate-edge)] bg-[var(--crate)] text-[var(--parchment)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <Link
              to="/"
              className="font-catalog shrink-0 text-2xl font-semibold uppercase tracking-[0.04em] text-[var(--parchment)]"
            >
              Placard
            </Link>
            <nav className="hidden gap-1 md:flex" aria-label="Main">
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
              {more.map((item) => (
                <NavLink key={item.to} to={item.to} className={navLink}>
                  {item.label}
                </NavLink>
              ))}
              {morePlugins.map((item) => (
                <NavLink key={item.to} to={item.to} className={navLink}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
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
                <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 md:pb-16 pb-24">
        <Outlet />
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--crate-edge)] bg-[var(--crate)]/95 backdrop-blur md:hidden"
        aria-label="Primary"
      >
        <div className="mx-auto flex max-w-6xl">
          <NavLink to="/" end className={bottomLink}>
            Library
          </NavLink>
          {primaryPlugins[0] ? (
            <NavLink to={primaryPlugins[0].to} className={bottomLink}>
              {primaryPlugins[0].label}
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
    </div>
  )
}
