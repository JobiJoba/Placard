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
  await expectEmptyLibrary(page)

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

  await openNav(memberPage, "Settings")
  await expect(memberPage.getByText("Distance unit")).toBeVisible()
  await expect(memberPage.getByRole("link", { name: "People" })).toHaveCount(0)
  await expect(memberPage.getByRole("link", { name: "Marketplace" })).toHaveCount(0)

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
