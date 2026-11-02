import { expect, test } from "@playwright/test"
import { signInAsAdmin } from "./support.ts"

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "uses an isolated fixture database")

test("budget settings persist and block Google requests before spending", async ({
  page,
  baseURL,
}) => {
  await page.route(/tile\.openstreetmap\.org|maps\.googleapis\.com/, (route) => route.abort())
  await signInAsAdmin(page, baseURL as string)
  const initial = await (await page.request.get("/api/admin/budget")).json()
  const origin = { origin: baseURL as string }
  try {
    await page.request.put("/api/admin/settings/google-api-key", {
      data: { apiKey: "fake-key" },
      headers: origin,
    })
    await page.goto("/settings/budget")
    await expect(page.getByText("Monthly free allowances", { exact: true })).toBeVisible()
    await expect(page.getByText(/Placard usage only/)).toBeVisible()
    await page.getByLabel("Monthly budget (USD)").fill("0")
    await page.getByLabel(/Pause requests that would exceed/).check()
    await page.getByLabel(/Apply the full monthly free allowances/).uncheck()
    await page.getByRole("button", { name: "Save budget" }).click()
    await expect(page.getByText("Budget saved.", { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel("Monthly budget (USD)")).toHaveValue("0")
    await expect(page.getByLabel(/Pause requests that would exceed/)).toBeChecked()
    await page.screenshot({ path: "/tmp/placard-budget-desktop.png", fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
    await page.screenshot({ path: "/tmp/placard-budget-mobile.png", fullPage: true })
    await page.goto("/add")
    await expect(page.getByText(/Estimated Google cost/)).toBeVisible()
    await page.getByLabel("Search Google Maps").fill("michele")
    await expect(page.getByRole("alert")).toContainText("budget")
    await page.getByRole("tab", { name: "Map", exact: true }).click()
    await expect(page.getByRole("alert")).toContainText("budget")
    const usage = await (await page.request.get("/api/admin/budget")).json()
    expect(usage.estimatedUsd).toBe(initial.estimatedUsd)
  } finally {
    await page.request.put("/api/admin/budget", { data: initial.settings, headers: origin })
    await page.request.delete("/api/admin/settings/google-api-key", { headers: origin })
  }
})
