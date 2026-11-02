import { expect, test } from "@playwright/test"
import { admin, browseAllPlaces, openAdd, openNav, signInAsAdmin } from "./support.ts"

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "needs a fresh install")
test.describe.configure({ mode: "serial" })

const member = {
  name: "Ben Household",
  email: "ben-hh@example.com",
  password: "another long password",
}

test.beforeEach(async ({ page }) => {
  await page.route(/tile\.openstreetmap\.org|maps\.googleapis\.com/, (route) => route.abort())
})

test("admin enables household, shares a place, member sees Shared filter", async ({
  page,
  browser,
  baseURL,
}) => {
  await signInAsAdmin(page, baseURL as string)

  await openNav(page, "Settings")
  await page.getByRole("link", { name: "People" }).click()
  await page.getByLabel("Enable household mode").click()
  await expect(page.getByLabel("Enable household mode")).toBeChecked()

  await page.getByLabel("Email").fill(member.email)
  await page.getByRole("button", { name: "Create invite" }).click()
  const inviteUrl = await page.getByTestId("invite-link").textContent()
  expect(inviteUrl).toMatch(/\/invite\//)

  await openAdd(page)
  await page.getByTestId("pin-map").click()
  await expect(page.getByText(/^Pinned at /)).toBeVisible()
  await page.getByLabel("Name").fill("Household Cafe")
  await page.getByRole("combobox", { name: "Type" }).click()
  await page.getByRole("option", { name: "Café" }).click()
  await page.getByRole("button", { name: "Save place" }).click()
  await expect(page.getByRole("heading", { name: "Household Cafe" })).toBeVisible()
  await page.getByRole("button", { name: "Share with household" }).click()
  await expect(page.getByText("Shared with the household.")).toBeVisible()

  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()
  await memberPage.route(/tile\.openstreetmap\.org|maps\.googleapis\.com/, (route) => route.abort())
  await memberPage.goto(inviteUrl as string)
  await memberPage.getByLabel("Name").fill(member.name)
  await memberPage.getByLabel("Password").fill(member.password)
  await memberPage.getByRole("button", { name: "Create account" }).click()

  await browseAllPlaces(memberPage)
  await expect(memberPage.getByRole("radio", { name: "Everyone" })).toBeVisible()
  // Hold the Shared response until Mine has finished to exercise out-of-order loads.
  const sharedStarted = Promise.withResolvers<void>()
  const releaseShared = Promise.withResolvers<void>()
  await memberPage.route("**/api/search", async (route) => {
    if (route.request().postDataJSON()?.householdScope === "shared") {
      const response = await route.fetch()
      sharedStarted.resolve()
      await releaseShared.promise
      await route.fulfill({ response })
    } else {
      await route.continue()
    }
  })
  await memberPage.getByRole("radio", { name: "Shared" }).click()
  await sharedStarted.promise
  await expect(memberPage.getByRole("heading", { name: "Household Cafe" })).toBeVisible()
  await expect(memberPage.getByText(`Shared by ${admin.name}`)).toBeVisible()

  const mineResponse = memberPage.waitForResponse(
    (response) =>
      response.url().endsWith("/api/search") &&
      response.request().postDataJSON()?.householdScope === "mine",
  )
  await memberPage.getByRole("radio", { name: "Mine" }).click()
  await mineResponse
  await expect(memberPage.getByRole("heading", { name: "Household Cafe" })).toHaveCount(0)

  const staleResponse = memberPage.waitForResponse(
    (response) =>
      response.url().endsWith("/api/search") &&
      response.request().postDataJSON()?.householdScope === "shared",
  )
  releaseShared.resolve()
  await (await staleResponse).finished()
  // Allow the response handlers and React's next render to finish before asserting.
  await memberPage.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
  await expect(memberPage.getByRole("heading", { name: "Household Cafe" })).toHaveCount(0)

  await memberContext.close()
})
