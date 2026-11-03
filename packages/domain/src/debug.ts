import { Schema } from "effect"

export const DebugLogEntry = Schema.Struct({
  id: Schema.Number,
  timestamp: Schema.String,
  level: Schema.String,
  message: Schema.String,
})

export const DebugView = Schema.Struct({
  version: Schema.String,
  revision: Schema.NullOr(Schema.String),
  nodeVersion: Schema.String,
  startedAt: Schema.String,
  uptimeSeconds: Schema.Number,
  logCapacity: Schema.Number,
  logs: Schema.Array(DebugLogEntry),
})
