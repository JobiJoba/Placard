import { expect, test } from "@playwright/test"

test("home page loads", async ({ page }) => {
  await page.goto("/")

  await expect(page).toHaveTitle("Placard")
  await expect(page.getByRole("heading", { level: 1, name: "Placard" })).toBeVisible()
})

test("health endpoint reports a healthy database", async ({ request }) => {
  const response = await request.get("/api/health")

  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ status: "ok", checks: { database: { ok: true } } })
})
