import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { HealthError, HealthOk } from "./health.ts"

export class HealthApi extends HttpApiGroup.make("health", { topLevel: true }).add(
  HttpApiEndpoint.get("health", "/api/health", {
    success: [HealthOk, HealthError],
  }),
) {}

export class Api extends HttpApi.make("placard")
  .add(HealthApi)
  .annotateMerge(
    OpenApi.annotations({
      title: "Placard API",
      version: "0.0.0",
    }),
  ) {}
