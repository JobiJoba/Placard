import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({ basePath: "/api/auth" })

interface SignUpInput {
  readonly name: string
  readonly email: string
  readonly password: string
  readonly inviteToken?: string
}

/** Resolves to an error message, or `null` on success. */
export const signUp = async (input: SignUpInput): Promise<string | null> => {
  const { error } = await authClient.signUp.email(input)
  return error ? (error.message ?? "Could not create your account.") : null
}

export const signIn = async (email: string, password: string): Promise<string | null> => {
  const { error } = await authClient.signIn.email({ email, password })
  return error ? (error.message ?? "Could not sign you in.") : null
}

export const signOut = () => authClient.signOut()
