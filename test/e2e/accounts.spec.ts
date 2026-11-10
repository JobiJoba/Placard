import { expect, test } from "@playwright/test"
import { admin, expectEmptyLibrary, openNav, signIn, signOut } from "./support.ts"

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "needs a fresh install")
test.describe.configure({ mode: "serial" })

const member = { name: "Ben Member", email: "ben@example.com", password: "another long password" }

test("the first visitor creates the admin account, signs out and back in", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByText("Create the admin account")).toBeVisible()

  await page.getByLabel("Name").fill(admin.name)
  await page.getByLabel("Email").fill(admin.email)
  await page.getByLabel("Password").fill(admin.password)
  await page.getByRole("button", { name: "Create admin account" }).click()
  await expect(page).toHaveURL(/\/setup\/google$/)
  await page.reload()
  await expect(page.getByText("Connect Google Maps", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Skip for now" }).click()
  await expectEmptyLibrary(page)
  await expect(page.getByRole("link", { name: "Explore plugins" })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Import places" })).toBeVisible()

  await signOut(page)
  await expect(page).toHaveURL(/\/login$/)

  await signIn(page, { ...admin, password: "wrong password" })
  await expect(page.getByRole("alert")).toContainText(/invalid/i)

  await signIn(page, admin)
  await expectEmptyLibrary(page)
})

test("a second visitor cannot sign up without an invite", async ({ page }) => {
  await page.goto("/setup")
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText("Ask the admin of this Placard for an invite link.")).toBeVisible()
})

test("the admin invites a user who gets their own empty library", async ({
  page,
  browser,
}, testInfo) => {
  await signIn(page, admin)
  await expectEmptyLibrary(page)
  await openNav(page, "Settings")
  const settingsNav = page.getByRole("navigation", { name: "Settings sections" })
  for (const section of ["Personal", "Library", "Administration"]) {
    await expect(settingsNav.getByText(section, { exact: true })).toBeVisible()
  }
  await settingsNav.getByRole("link", { name: "Debug" }).click()
  await expect(page.getByText("Placard version", { exact: true })).toBeVisible()
  const logs = page.getByRole("region", { name: "Server logs" })
  await expect(logs).toContainText("Starting Placard")
  await page.getByLabel("Search logs").fill("no-such-log-entry")
  await expect(logs).toContainText("No logs match your filters.")
  await page.getByLabel("Search logs").fill("")
  await page.getByLabel("Log level").selectOption("info")
  await expect(logs).toContainText("Starting Placard")
  await page.screenshot({ path: testInfo.outputPath("debug-desktop.png"), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(settingsNav.getByRole("link", { name: "Debug" })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: testInfo.outputPath("debug-mobile.png"), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.getByRole("link", { name: "People" }).click()
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
  await expectEmptyLibrary(memberPage)
  await expect(memberPage.getByText(`Welcome, ${member.name}.`)).toBeVisible()

  await memberPage.goto("/setup/google")
  await expect(memberPage).toHaveURL(/\/$/)
  await openNav(memberPage, "Settings")
  await expect(memberPage.getByText("Distance unit")).toBeVisible()
  await expect(memberPage.getByRole("link", { name: "People" })).toHaveCount(0)
  await expect(memberPage.getByRole("link", { name: "Manage plugins" })).toHaveCount(0)
  await memberPage.goto("/settings/manage-plugins")
  await expect(memberPage).toHaveURL(/\/settings\/general$/)

  await expect(memberPage.getByRole("link", { name: "Debug" })).toHaveCount(0)
  await memberPage.goto("/settings/debug")
  await expect(memberPage).toHaveURL(/\/settings\/general$/)
  await expect(memberPage.getByRole("region", { name: "Server logs" })).toHaveCount(0)

  await memberPage.getByRole("radio", { name: "Miles" }).click()
  await expect(memberPage.getByRole("radio", { name: "Miles" })).toBeChecked()
  await memberPage.reload()
  await expect(memberPage.getByRole("radio", { name: "Miles" })).toBeChecked()
  await memberContext.close()

  await page.getByRole("link", { name: "General" }).click()
  await expect(page.getByRole("radio", { name: "Kilometers" })).toBeChecked()
  await page.getByRole("link", { name: "People" }).click()
  await expect(page.getByText(member.email)).toHaveCount(2)
})

test("Google onboarding handles a rejected key, retry, saved key and environment key", async ({
  page,
  baseURL,
}) => {
  await signIn(page, admin)
  await expectEmptyLibrary(page)
  await page.goto("/setup/google")
  await page.getByText("How to get a Google Maps API key", { exact: true }).click()
  await expect(page.getByRole("link", { name: "Places API (New)", exact: true })).toBeVisible()
  await expect(page.getByLabel("Google Maps API key")).toHaveAttribute("type", "password")
  await page.route(
    "**/api/admin/settings/google-api-key",
    async (route) => {
      await route.fulfill({
        status: 422,
        json: { _tag: "GoogleKeyRejected", message: "Google rejected the key: invalid key" },
      })
    },
    { times: 1 },
  )
  await page.getByLabel("Google Maps API key").fill("bad-key")
  await page.getByRole("button", { name: "Test and continue" }).click()
  await expect(page.getByRole("alert")).toContainText("invalid key")
  await page.getByLabel("Google Maps API key").fill("fake-key")
  await page.getByRole("button", { name: "Test and continue" }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto("/settings/integrations")
  await expect(page.getByTestId("google-key-status")).toContainText("ending in -key")
  await expect(page.getByLabel("New key")).toHaveValue("")
  await expect(page.getByLabel("New key")).toHaveAttribute("type", "password")
  await page.goto("/setup/google")
  await expect(page.getByText(/Using the key saved for this instance/)).toBeVisible()
  await page.getByRole("button", { name: "Continue to library" }).click()

  await page.route("**/api/admin/settings", async (route) => {
    const response = await route.fetch()
    const settings = await response.json()
    await route.fulfill({ json: { ...settings, googleApiKey: { source: "env", last4: "1234" } } })
  })
  await page.goto("/setup/google")
  await expect(page.getByText(/Using the GOOGLE_MAPS_API_KEY environment variable/)).toContainText(
    "1234",
  )
  await expect(page.getByLabel("Google Maps API key")).toHaveCount(0)
  await page.getByRole("button", { name: "Continue to library" }).click()
  await page.request.delete("/api/admin/settings/google-api-key", {
    headers: { origin: baseURL as string },
  })
})
