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

const primary = [
  { to: "/", label: "Library", end: true },
  { to: "/add", label: "Add" },
] as const

const more = [
  { to: "/import", label: "Import" },
  { to: "/lists", label: "Lists" },
  { to: "/deleted", label: "Recently deleted" },
  { to: "/settings", label: "Settings" },
] as const

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-2.5 py-1.5 text-sm transition-colors hover:text-foreground",
    isActive ? "bg-muted text-foreground" : "text-muted-foreground",
  )

const bottomLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors",
    isActive ? "text-foreground" : "text-muted-foreground",
  )

export function AppShell() {
  const me = useMe()
  const { signOut } = useSession()

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between gap-3 py-4 sm:py-6">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <Link to="/" className="shrink-0 text-2xl font-semibold tracking-tight">
            Placard
          </Link>
          <nav className="hidden gap-1 md:flex" aria-label="Main">
            {primary.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                className={navLink}
              >
                {item.label}
              </NavLink>
            ))}
            {more.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLink}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground lg:inline">{me.name}</span>
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden" aria-label="Menu">
                <Menu aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {primary.map((item) => (
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="flex-1 pb-24 md:pb-16">
        <Outlet />
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden"
        aria-label="Primary"
      >
        <div className="mx-auto flex max-w-4xl">
          <NavLink to="/" end className={bottomLink}>
            Library
          </NavLink>
          <NavLink to="/add" className={bottomLink}>
            Add
          </NavLink>
          <NavLink to="/import" className={bottomLink}>
            Import
          </NavLink>
          <NavLink to="/settings" className={bottomLink}>
            Settings
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
