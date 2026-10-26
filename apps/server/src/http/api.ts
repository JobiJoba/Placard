import { Api } from "@placard/domain"
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { HealthApiLive } from "./health.ts"

export const ApiLive = HttpApiBuilder.layer(Api, {
  openapiPath: "/openapi.json",
}).pipe(Layer.provide(HealthApiLive))
