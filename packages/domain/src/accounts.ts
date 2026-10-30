import { Context, Schema } from "effect"
import { HttpApiMiddleware } from "effect/http-api"

export const UserRole = Schema.Literals(["admin", "member"])
export type UserRole = typeof UserRole.Type

export const DistanceUnit = Schema.Literals(["km", "mi"])
export type DistanceUnit = typeof DistanceUnit.Type

export const Email = Schema.Trim.pipe(
  Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: "Enter a valid email" })),
)

export const Me = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: UserRole,
  distanceUnit: DistanceUnit,
  /** Public avatar URL path, or null when using the letter stand-in. */
  image: Schema.NullOr(Schema.String),
  /** Instance admin toggle; gates share UI and household library filters. */
  householdEnabled: Schema.Boolean,
})
export type Me = typeof Me.Type

export const UserSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: UserRole,
  image: Schema.NullOr(Schema.String),
  createdAt: Schema.DateTimeUtcFromString,
})
export type UserSummary = typeof UserSummary.Type

/** Lightweight member row for household “Shared by” filters. */
export const HouseholdMember = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  image: Schema.NullOr(Schema.String),
})
export type HouseholdMember = typeof HouseholdMember.Type

export const ProfileUpdate = Schema.Struct({
  name: Schema.Trim.pipe(
    Schema.check(Schema.isBetweenLength(1, 80, { message: "Enter a name (1–80 characters)" })),
  ),
})
export type ProfileUpdate = typeof ProfileUpdate.Type

export const AvatarUpload = Schema.Struct({
  filename: Schema.Trim.pipe(Schema.check(Schema.isBetweenLength(1, 260))),
  mimeType: Schema.Trim.pipe(Schema.check(Schema.isBetweenLength(3, 100))),
  contentBase64: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
})
export type AvatarUpload = typeof AvatarUpload.Type

export const InviteStatus = Schema.Literals(["pending", "accepted", "expired", "revoked"])
export type InviteStatus = typeof InviteStatus.Type

export const Invite = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  status: InviteStatus,
  expiresAt: Schema.DateTimeUtcFromString,
  createdAt: Schema.DateTimeUtcFromString,
})
export type Invite = typeof Invite.Type

export const CreatedInvite = Schema.Struct({
  invite: Invite,
  url: Schema.String,
})
export type CreatedInvite = typeof CreatedInvite.Type

export const SetupStatus = Schema.Struct({
  signupOpen: Schema.Boolean,
})
export type SetupStatus = typeof SetupStatus.Type

export const InviteLookup = Schema.Struct({
  email: Schema.String,
})
export type InviteLookup = typeof InviteLookup.Type

export const GoogleKeySource = Schema.Literals(["instance", "env", "none"])
export type GoogleKeySource = typeof GoogleKeySource.Type

export const InstanceSettingsView = Schema.Struct({
  googleApiKey: Schema.Struct({
    source: GoogleKeySource,
    last4: Schema.NullOr(Schema.String),
  }),
  /** When true, members can share places with everyone on this instance. */
  householdEnabled: Schema.Boolean,
  /**
   * How often the worker checks GitHub-sourced plugins for newer releases.
   * `0` disables automatic checks (manual check still works).
   */
  moduleUpdateCheckHours: Schema.Int.pipe(
    Schema.check(Schema.isBetween({ minimum: 0, maximum: 168 })),
  ),
})
export type InstanceSettingsView = typeof InstanceSettingsView.Type

export const ModuleUpdateCheckHoursUpdate = Schema.Struct({
  hours: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 168 }))),
})
export type ModuleUpdateCheckHoursUpdate = typeof ModuleUpdateCheckHoursUpdate.Type

export const HouseholdEnabledUpdate = Schema.Struct({
  enabled: Schema.Boolean,
})
export type HouseholdEnabledUpdate = typeof HouseholdEnabledUpdate.Type

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()(
  "Forbidden",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

export class InviteNotFound extends Schema.TaggedError<InviteNotFound>()(
  "InviteNotFound",
  {},
  { httpApiStatus: 404 },
) {}

export class EmailAlreadyRegistered extends Schema.TaggedError<EmailAlreadyRegistered>()(
  "EmailAlreadyRegistered",
  { email: Schema.String },
  { httpApiStatus: 409 },
) {}

export class GoogleKeyRejected extends Schema.TaggedError<GoogleKeyRejected>()(
  "GoogleKeyRejected",
  { message: Schema.String },
  { httpApiStatus: 422 },
) {}

export class CurrentUser extends Context.Service<CurrentUser, Me>()("placard/CurrentUser") {}

/** Resolves the session cookie to the signed-in user. */
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentUser }
>()("placard/Authentication", { error: Unauthorized }) {}

/** {@link Authentication} plus a check that the user is the admin. */
export class AdminAuthentication extends HttpApiMiddleware.Service<
  AdminAuthentication,
  { provides: CurrentUser }
>()("placard/AdminAuthentication", { error: [Unauthorized, Forbidden] }) {}
