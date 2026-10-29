import { Schema } from "effect"

/** Metadata for a personal access token (secret never listed after create). */
export const ApiToken = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  createdAt: Schema.DateTimeUtcFromString,
  lastUsedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  revokedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
})
export type ApiToken = typeof ApiToken.Type

export const CreateTokenInput = Schema.Struct({
  name: Schema.Trim.pipe(
    Schema.check(Schema.isMinLength(1, { message: "Give the token a name" })),
    Schema.check(Schema.isMaxLength(100)),
  ),
})
export type CreateTokenInput = typeof CreateTokenInput.Type

/** Returned once when creating a token — store the secret; it is not shown again. */
export const CreatedToken = Schema.Struct({
  token: ApiToken,
  secret: Schema.String,
})
export type CreatedToken = typeof CreatedToken.Type

export class TokenNotFound extends Schema.TaggedError<TokenNotFound>()(
  "TokenNotFound",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

/** MCP endpoint status for the Connect page. */
export const McpStatus = Schema.Struct({
  enabled: Schema.Boolean,
  endpoint: Schema.String,
})
export type McpStatus = typeof McpStatus.Type
