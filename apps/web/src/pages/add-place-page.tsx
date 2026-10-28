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

const mapFallback = <Skeleton className="h-[420px] rounded-xl" />

export function AddPlacePage() {
  const me = useMe()
  const { data: config, error } = useLoad(useCallback(() => api((c) => c.google.config()), []))

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Add a place</h1>
        <p className="text-sm text-muted-foreground">
          Prefer Search when you know the name. Use Pick on map for a Google place, or Drop a pin
          for somewhere Google doesn’t list.
        </p>
      </div>
      <ErrorAlert message={error} />
      {config === null ? (
        !error && mapFallback
      ) : config.mapsApiKey ? (
        <Tabs defaultValue="search" className="gap-4">
          <TabsList>
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="map">Google place</TabsTrigger>
            <TabsTrigger value="pin">Custom pin</TabsTrigger>
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
