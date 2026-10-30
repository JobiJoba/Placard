import { lazy, Suspense, useCallback } from "react"
import { Link } from "react-router"
import { SearchAdd } from "@/components/add/search-add"
import { ErrorAlert } from "@/components/error-alert"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api"
import { useLoad } from "@/lib/use-load"
import { useMe } from "@/session"

const GoogleMapPicker = lazy(() => import("@/components/add/google-map-picker"))
const PinDropper = lazy(() => import("@/components/add/pin-dropper"))

const mapFallback = <Skeleton className="h-[420px] rounded-md" />

const tabTriggerClass =
  "data-active:bg-[color-mix(in_srgb,var(--spine-gold)_28%,var(--parchment))] data-active:text-[var(--crate)] data-active:shadow-none"

export function AddPlacePage() {
  const me = useMe()
  const { data: config, error } = useLoad(useCallback(() => api((c) => c.google.config()), []))

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-catalog text-4xl font-semibold tracking-wide uppercase sm:text-5xl">
          Add a place
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Prefer Search when you know the name. Map picks a Google place; Drop pin is for spots
          Google misses.
        </p>
      </div>
      <ErrorAlert message={error} />
      {config === null ? (
        !error && mapFallback
      ) : config.mapsApiKey ? (
        <Tabs defaultValue="search" className="gap-4">
          <TabsList className="h-auto flex-wrap bg-[color-mix(in_srgb,var(--crate)_8%,var(--parchment))]">
            <TabsTrigger value="search" className={tabTriggerClass}>
              Search
            </TabsTrigger>
            <TabsTrigger value="map" className={tabTriggerClass}>
              Map
            </TabsTrigger>
            <TabsTrigger
              value="pin"
              className={`${tabTriggerClass} text-muted-foreground data-active:text-[var(--crate)]`}
            >
              Drop pin
            </TabsTrigger>
          </TabsList>
          <TabsContent value="search">
            <SearchAdd />
          </TabsContent>
          <TabsContent value="map">
            <Suspense fallback={mapFallback}>
              <GoogleMapPicker apiKey={config.mapsApiKey} />
            </Suspense>
          </TabsContent>
          <TabsContent value="pin">
            <Suspense fallback={mapFallback}>
              <PinDropper />
            </Suspense>
          </TabsContent>
        </Tabs>
      ) : (
        <>
          <Alert>
            <AlertDescription>
              {me.role === "admin" ? (
                <span>
                  Searching Google and picking places on its map need a Google API key.{" "}
                  <Link to="/settings/integrations" className="underline underline-offset-4">
                    Add one in Settings → Integrations
                  </Link>
                  .
                </span>
              ) : (
                "Searching Google needs a Google API key. Until your admin adds one, drop a pin."
              )}
            </AlertDescription>
          </Alert>
          <Suspense fallback={mapFallback}>
            <PinDropper />
          </Suspense>
        </>
      )}
    </section>
  )
}
