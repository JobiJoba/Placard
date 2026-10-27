import { Layer } from "effect"
import { Auth } from "../auth/auth.ts"
import { InstanceSettings } from "../settings/instance-settings.ts"
import { Invites } from "./invites.ts"
import { SignupGate } from "./signup.ts"
import { Users } from "./users.ts"

/** Users, invites, signup, auth and instance settings. Needs a GoogleKeyVerifier. */
export const AccountsLayer = Layer.mergeAll(Auth.layer, InstanceSettings.layer).pipe(
  Layer.provideMerge(SignupGate.layer),
  Layer.provideMerge(Invites.layer),
  Layer.provideMerge(Users.layer),
)
