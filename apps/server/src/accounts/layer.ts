import { Layer } from "effect"
import { Auth } from "../auth/auth.ts"
import { GoogleKeyVerifier } from "../settings/google-key.ts"
import { InstanceSettings } from "../settings/instance-settings.ts"
import { Invites } from "./invites.ts"
import { SignupGate } from "./signup.ts"
import { Users } from "./users.ts"

/** Users, invites, signup, auth and instance settings. Needs an HttpClient for Google. */
export const AccountsLayer = Layer.mergeAll(Auth.layer, InstanceSettings.layer).pipe(
  Layer.provideMerge(GoogleKeyVerifier.layer),
  Layer.provideMerge(SignupGate.layer),
  Layer.provideMerge(Invites.layer),
  Layer.provideMerge(Users.layer),
)
