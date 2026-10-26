import { Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { OtlpSerialization, OtlpTracer } from "effect/observability"

/**
 * Exports traces when Aspire (or any collector) sets OTEL_EXPORTER_OTLP_ENDPOINT.
 * No-op when the env var is absent so local/docker runs stay quiet.
 */
export const ObservabilityLive: Layer.Layer<never> = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()
  ? OtlpTracer.layerFromConfig({
      resource: {
        serviceName: process.env.OTEL_SERVICE_NAME ?? "placard",
      },
    }).pipe(
      Layer.provide(OtlpSerialization.layerJson),
      Layer.provide(FetchHttpClient.layer),
      Layer.orDie,
    )
  : Layer.empty
