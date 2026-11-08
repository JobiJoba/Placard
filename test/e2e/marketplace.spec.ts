import { expect, test } from "@playwright/test"
import { signInAsAdmin } from "./support"

test("marketplace discovery and immediate activation work on desktop and mobile", async ({
  page,
  baseURL,
}, testInfo) => {
  await signInAsAdmin(page, baseURL ?? "http://localhost:3100")
  await page.goto("/?scope=all")
  await expect(page.getByRole("heading", { name: "Start your crate" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Explore plugins" })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Import places" })).toBeVisible()
  await page
    .getByRole("navigation", { name: "Main", exact: true })
    .getByRole("link", { name: "Marketplace" })
    .click()
  await expect(page.getByRole("heading", { name: "Marketplace", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Activate", exact: true })).toHaveCount(5)
  const pick = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Pick", exact: true }) })
  await pick.getByRole("button", { name: "Activate", exact: true }).click()
  await pick.getByRole("link", { name: "Open Pick" }).click()
  await expect(page).toHaveURL(/\/m\/places.pick$/)
  await expect(page.getByRole("heading", { name: /Pick/ }).first()).toBeVisible()
  await expect(page.getByRole("alert")).toHaveCount(0)
  await page.goto("/marketplace")
  await page.screenshot({ path: testInfo.outputPath("marketplace-desktop.png"), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    page
      .getByRole("navigation", { name: "Primary", exact: true })
      .getByRole("link", { name: "Marketplace" }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: testInfo.outputPath("marketplace-mobile.png"), fullPage: true })
  await page.goto("/settings/marketplace")
  await expect(page).toHaveURL(/\/marketplace$/)
  await page.goto("/?scope=all")
  await expect(page.getByRole("link", { name: "Explore plugins" })).toHaveCount(0)
})
