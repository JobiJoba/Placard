import { NavLink, Outlet } from "react-router"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useMe, useSession } from "@/session"

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-2.5 py-1.5 text-sm transition-colors hover:text-foreground",
    isActive ? "bg-muted text-foreground" : "text-muted-foreground",
  )

export function AppShell() {
  const me = useMe()
  const { signOut } = useSession()

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-6">
      <header className="flex items-center justify-between gap-4 py-6">
        <div className="flex items-center gap-6">
          <span className="text-2xl font-semibold tracking-tight">Placard</span>
          <nav className="flex gap-1" aria-label="Main">
            <NavLink to="/" end className={navLink}>
              Library
            </NavLink>
            <NavLink to="/add" className={navLink}>
              Add
            </NavLink>
            <NavLink to="/lists" className={navLink}>
              Lists
            </NavLink>
            <NavLink to="/settings" className={navLink}>
              Settings
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{me.name}</span>
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="flex-1 pb-16">
        <Outlet />
      </main>
    </div>
  )
}
