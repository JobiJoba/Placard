import { expect, type Page, test } from "@playwright/test"

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "needs a fresh install")
test.describe.configure({ mode: "serial" })

const admin = { name: "Ada Admin", email: "ada@example.com", password: "correct horse battery" }
const member = { name: "Ben Member", email: "ben@example.com", password: "another long password" }

const emptyLibrary = (page: Page) =>
  expect(page.getByRole("heading", { name: "Your library is empty" })).toBeVisible()

const signIn = async (page: Page, user: { email: string; password: string }) => {
  await page.goto("/login")
  await page.getByLabel("Email").fill(user.email)
  await page.getByLabel("Password").fill(user.password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

test("the first visitor creates the admin account, signs out and back in", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByText("Create the admin account")).toBeVisible()

  await page.getByLabel("Name").fill(admin.name)
  await page.getByLabel("Email").fill(admin.email)
  await page.getByLabel("Password").fill(admin.password)
  await page.getByRole("button", { name: "Create admin account" }).click()
  await emptyLibrary(page)

  await page.getByRole("button", { name: "Sign out" }).click()
  await expect(page).toHaveURL(/\/login$/)

  await signIn(page, { ...admin, password: "wrong password" })
  await expect(page.getByRole("alert")).toContainText(/invalid/i)

  await signIn(page, admin)
  await emptyLibrary(page)
})

test("a second visitor cannot sign up without an invite", async ({ page }) => {
  await page.goto("/setup")
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText("Ask the admin of this Placard for an invite link.")).toBeVisible()
})

test("the admin invites a user who gets their own empty library", async ({ page, browser }) => {
  await signIn(page, admin)
  await emptyLibrary(page)
  await page.getByRole("link", { name: "Settings" }).click()
  await page.getByLabel("Email").fill(member.email)
  await page.getByRole("button", { name: "Create invite" }).click()
  const inviteUrl = await page.getByTestId("invite-link").textContent()
  expect(inviteUrl).toMatch(/\/invite\//)

  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()
  await memberPage.goto(inviteUrl as string)
  await expect(memberPage.getByText("Join Placard")).toBeVisible()
  await expect(memberPage.getByLabel("Email")).toHaveValue(member.email)
  await memberPage.getByLabel("Name").fill(member.name)
  await memberPage.getByLabel("Password").fill(member.password)
  await memberPage.getByRole("button", { name: "Create account" }).click()
  await emptyLibrary(memberPage)
  await expect(memberPage.getByText(`Welcome, ${member.name}.`)).toBeVisible()

  await memberPage.getByRole("link", { name: "Settings" }).click()
  await expect(memberPage.getByText("Distance unit")).toBeVisible()
  await expect(memberPage.getByText("Invites")).toHaveCount(0)

  await memberPage.getByRole("radio", { name: "Miles" }).click()
  await expect(memberPage.getByRole("radio", { name: "Miles" })).toBeChecked()
  await memberPage.reload()
  await expect(memberPage.getByRole("radio", { name: "Miles" })).toBeChecked()
  await memberContext.close()

  await page.reload()
  await expect(page.getByRole("radio", { name: "Kilometers" })).toBeChecked()
  await expect(page.getByText(member.email)).toHaveCount(2)
})
