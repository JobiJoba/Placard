import type { Me } from "@placard/domain"
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react"
import { Navigate, useLocation } from "react-router"
import { api, isTagged } from "@/lib/api"
import { signOut as authSignOut } from "@/lib/auth-client"

type SessionState =
  | { readonly status: "loading" }
  | { readonly status: "signedOut" }
  | { readonly status: "signedIn"; readonly me: Me }

interface Session {
  readonly state: SessionState
  readonly refresh: () => Promise<void>
  readonly setMe: (me: Me) => void
  readonly signOut: () => Promise<void>
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" })

  const refresh = useCallback(async () => {
    try {
      const me = await api((client) => client.me.get())
      setState({ status: "signedIn", me })
    } catch (error) {
      if (!isTagged(error, "Unauthorized")) console.error(error)
      setState({ status: "signedOut" })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const session: Session = {
    state,
    refresh,
    setMe: (me) => setState({ status: "signedIn", me }),
    signOut: async () => {
      await authSignOut()
      setState({ status: "signedOut" })
    },
  }

  return <SessionContext value={session}>{children}</SessionContext>
}

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error("useSession must be used inside <SessionProvider>")
  return session
}

/** The signed-in user; only valid inside {@link RequireUser}. */
export function useMe(): Me {
  const { state } = useSession()
  if (state.status !== "signedIn") throw new Error("useMe used outside <RequireUser>")
  return state.me
}

export function RequireUser({ children }: { readonly children: ReactNode }) {
  const { state } = useSession()
  const location = useLocation()
  if (state.status === "loading") return <FullPageMessage>Loading…</FullPageMessage>
  if (state.status === "signedOut") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}

export function FullPageMessage({ children }: { readonly children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-muted-foreground">
      {children}
    </main>
  )
}
