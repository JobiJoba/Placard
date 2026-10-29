import type { ReactNode } from "react"
import { Navigate, NavLink, Outlet, useLocation } from "react-router"
import { cn } from "@/lib/utils"
import { useMe } from "@/session"

type NavItem = {
  readonly to: string
  readonly label: string
  readonly adminOnly?: boolean
  /** Extra path prefixes that keep this item active (e.g. module detail under Marketplace). */
  readonly activePrefixes?: ReadonlyArray<string>
}

const staticNavItems: ReadonlyArray<NavItem> = [
  { to: "/settings/general", label: "General" },
  { to: "/settings/mcp", label: "MCP" },
  {
    to: "/settings/marketplace",
    label: "Marketplace",
    adminOnly: true,
    activePrefixes: ["/settings/modules"],
  },
  { to: "/settings/integrations", label: "Integrations", adminOnly: true },
  { to: "/settings/people", label: "People", adminOnly: true },
]

const adminPaths = new Set(staticNavItems.filter((item) => item.adminOnly).map((item) => item.to))

const linkClass = (active: boolean) =>
  cn(
    "rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
    active
      ? "bg-[var(--crate)] text-[var(--parchment)]"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  )

const isNavActive = (item: NavItem, pathname: string, routeActive: boolean) => {
  if (routeActive) return true
  return (item.activePrefixes ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export function SettingsLayout() {
  const me = useMe()
  const location = useLocation()
  const isAdmin = me.role === "admin"
  const items = staticNavItems.filter((item) => !item.adminOnly || isAdmin)

  if (
    !isAdmin &&
    (adminPaths.has(location.pathname) || location.pathname.startsWith("/settings/modules"))
  ) {
    return <Navigate to="/settings/general" replace />
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <nav
          aria-label="Settings sections"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:w-52 md:shrink-0 md:flex-col md:overflow-visible md:px-0 md:pb-0"
        >
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                linkClass(isNavActive(item, location.pathname, isActive))
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

/** Guard for admin-only settings pages when used as a route element. */
export function RequireSettingsAdmin({ children }: { readonly children: ReactNode }) {
  const me = useMe()
  if (me.role !== "admin") return <Navigate to="/settings/general" replace />
  return children
}
