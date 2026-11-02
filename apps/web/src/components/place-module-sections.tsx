import { Component, type ComponentType, type ReactNode, useEffect, useState } from "react"
import { useModules } from "@/modules"

type PlaceContext = {
  readonly placeId: string
  readonly category: string
  readonly isOwner: boolean
}

class SectionBoundary extends Component<
  { children: ReactNode; label: string },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <p role="alert">Could not display {this.props.label}.</p>
    ) : (
      this.props.children
    )
  }
}

function Section({
  url,
  exportName,
  context,
}: {
  url: string
  exportName: string
  context: PlaceContext
}) {
  const [View, setView] = useState<ComponentType<PlaceContext> | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    setView(null)
    setFailed(false)
    void import(/* @vite-ignore */ url)
      .then((entry) => {
        if (!active) return
        const view = entry[exportName] ?? entry.default?.[exportName]
        if (typeof view !== "function") {
          setFailed(true)
          return
        }
        setView(() => view)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [url, exportName])
  if (failed) return <p role="alert">Could not load this module section.</p>
  if (!View) return <p role="status">Loading section…</p>
  return <View {...context} />
}

export function PlaceModuleSections(context: PlaceContext) {
  const { data: modules } = useModules()
  return (
    <>
      {modules
        ?.filter((mod) => mod.visible && mod.webEntryUrl)
        .flatMap((mod) =>
          (mod.placeSections ?? []).map((section) => (
            <SectionBoundary
              key={`${mod.id}/${section.id}/${context.placeId}/${mod.version}`}
              label={section.label}
            >
              <Section
                url={mod.webEntryUrl ?? ""}
                exportName={section.exportName}
                context={context}
              />
            </SectionBoundary>
          )),
        )}
    </>
  )
}
