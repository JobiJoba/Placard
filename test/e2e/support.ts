import type { Page } from "@playwright/test"

export const admin = {
  name: "Ada Admin",
  email: "ada@example.com",
  password: "correct horse battery",
}

export const signIn = async (page: Page, user: { email: string; password: string }) => {
  await page.goto("/login")
  await page.getByLabel("Email").fill(user.email)
  await page.getByLabel("Password").fill(user.password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

/** Signs in as the admin, creating the account first if this spec runs on its own. */
export const signInAsAdmin = async (page: Page, baseURL: string) => {
  const setup = await page.request.get("/api/setup")
  if ((await setup.json()).signupOpen) {
    await page.request.post("/api/auth/sign-up/email", {
      data: admin,
      headers: { origin: new URL(baseURL).origin },
    })
  }
  await signIn(page, admin)
  await page.getByRole("navigation", { name: "Main" }).waitFor()
}
