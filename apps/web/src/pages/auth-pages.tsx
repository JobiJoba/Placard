import { type FormEvent, type ReactNode, useEffect, useState } from "react"
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import { signIn, signUp } from "@/lib/auth-client"
import { FullPageMessage, useSession } from "@/session"

const MIN_PASSWORD = 8

function AuthLayout({
  title,
  description,
  children,
}: {
  readonly title: string
  readonly description: ReactNode
  readonly children: ReactNode
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-16">
      <p className="text-4xl font-semibold tracking-tight">Placard</p>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  )
}

function FormError({ message }: { readonly message: string | null }) {
  if (!message) return null
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

/** `true` while signup is open (fresh install), `false` after, `null` while loading. */
function useSignupOpen(): boolean | null {
  const [open, setOpen] = useState<boolean | null>(null)
  useEffect(() => {
    api((client) => client.setup.status()).then(
      (status) => setOpen(status.signupOpen),
      () => setOpen(false),
    )
  }, [])
  return open
}

function useAfterAuth() {
  const { refresh } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? "/"
  return async () => {
    await refresh()
    navigate(from, { replace: true })
  }
}

interface AccountFields {
  readonly name: string
  readonly email: string
  readonly password: string
}

function AccountForm({
  email,
  submitLabel,
  onSubmit,
}: {
  readonly email?: string
  readonly submitLabel: string
  readonly onSubmit: (fields: AccountFields) => Promise<string | null>
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    const message = await onSubmit({
      name: String(data.get("name")).trim(),
      email: email ?? String(data.get("email")).trim(),
      password: String(data.get("password")),
    })
    setPending(false)
    setError(message)
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" name="name" autoComplete="name" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          {email ? (
            <Input id="email" value={email} readOnly disabled />
          ) : (
            <Input id="email" name="email" type="email" autoComplete="email" required />
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
          />
          <FieldDescription>At least {MIN_PASSWORD} characters.</FieldDescription>
        </Field>
        <FormError message={error} />
        <Button type="submit" disabled={pending}>
          {pending ? "Creating account…" : submitLabel}
        </Button>
      </FieldGroup>
    </form>
  )
}

export function LoginPage() {
  const signupOpen = useSignupOpen()
  const { state } = useSession()
  const afterAuth = useAfterAuth()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (state.status === "signedIn") return <Navigate to="/" replace />
  if (signupOpen === null) {
    return (
      <AuthLayout title="Sign in" description="Loading…">
        <p className="text-sm text-muted-foreground">Checking this Placard…</p>
      </AuthLayout>
    )
  }
  if (signupOpen) return <Navigate to="/setup" replace />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    const message = await signIn(String(data.get("email")).trim(), String(data.get("password")))
    setPending(false)
    if (message) setError(message)
    else await afterAuth()
  }

  return (
    <AuthLayout title="Sign in" description="Welcome back to your places.">
      <form onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <FormError message={error} />
          <Button type="submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <FieldDescription className="text-center">
            Forgot your password? Sign in isn't recoverable by email on this install — ask your
            Placard admin for help, or change it under Settings once you're signed in.
          </FieldDescription>
          <FieldDescription className="text-center">
            New here? Ask the admin of this Placard for an invite link.
          </FieldDescription>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}

export function SetupPage() {
  const signupOpen = useSignupOpen()
  const afterAuth = useAfterAuth()

  if (signupOpen === null) return <FullPageMessage>Loading…</FullPageMessage>
  if (!signupOpen) return <Navigate to="/login" replace />

  return (
    <AuthLayout
      title="Create the admin account"
      description="You're the first person here, so this account will run the instance. Everyone else joins by invite."
    >
      <AccountForm
        submitLabel="Create admin account"
        onSubmit={async (fields) => {
          const message = await signUp(fields)
          if (!message) await afterAuth()
          return message
        }}
      />
    </AuthLayout>
  )
}

export function InvitePage() {
  const { token = "" } = useParams()
  const afterAuth = useAfterAuth()
  const [invite, setInvite] = useState<{ email: string } | "invalid" | null>(null)

  useEffect(() => {
    api((client) => client.setup.invite({ params: { token } })).then(setInvite, () =>
      setInvite("invalid"),
    )
  }, [token])

  if (invite === null) return <FullPageMessage>Loading…</FullPageMessage>
  if (invite === "invalid") {
    return (
      <AuthLayout
        title="This invite doesn't work"
        description="It may have been used already, revoked, or expired. Ask your admin for a new link."
      >
        <Button variant="outline" className="w-full" asChild>
          <Link to="/login">Go to sign in</Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Join Placard" description="You've been invited. Choose a name and password.">
      <AccountForm
        email={invite.email}
        submitLabel="Create account"
        onSubmit={async (fields) => {
          const message = await signUp({ ...fields, inviteToken: token })
          if (!message) await afterAuth()
          return message
        }}
      />
    </AuthLayout>
  )
}
