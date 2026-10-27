import { expect, test } from "@playwright/test"

test("the app loads", async ({ page }) => {
  await page.goto("/")

  await expect(page).toHaveTitle("Placard")
  await expect(page.getByText("Placard", { exact: true }).first()).toBeVisible()
})

test("health endpoint reports a healthy database", async ({ request }) => {
  const response = await request.get("/api/health")

  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ status: "ok", checks: { database: { ok: true } } })
})

test("API routes require a session", async ({ request }) => {
  const response = await request.get("/api/me")

  expect(response.status()).toBe(401)
  expect(await response.json()).toMatchObject({ _tag: "Unauthorized" })
})
