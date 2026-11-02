import { createContext, type ReactNode, useCallback, useContext } from "react"
import { api } from "@/lib/api"
import { useLoad } from "@/lib/use-load"

const ModulesContext = createContext<ReturnType<typeof useModuleState> | null>(null)

function useModuleState() {
  return useLoad(useCallback(() => api((c) => c.modules.me()), []))
}

/** One module list for navigation, routes and user settings. */
export function ModulesProvider({ children }: { readonly children: ReactNode }) {
  const state = useModuleState()
  return <ModulesContext value={state}>{children}</ModulesContext>
}

export function useModules() {
  const state = useContext(ModulesContext)
  if (!state) throw new Error("useModules must be used inside <ModulesProvider>")
  return state
}
