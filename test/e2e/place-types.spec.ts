import { expect, test } from "@playwright/test"
import { openAdd, signInAsAdmin } from "./support.ts"

test("custom types persist and can be used to add, edit, and filter places", async ({
  page,
  baseURL,
}) => {
  await page.route(/tile\.openstreetmap\.org|maps\.googleapis\.com/, (route) => route.abort())
  await signInAsAdmin(page, baseURL as string)
  await page.goto("/settings/place-types")
  await expect(page.getByText("Built-in types", { exact: true })).toBeVisible()
  await page.getByLabel("Type name").fill("Record shop & café")
  await page.getByRole("button", { name: "Add type", exact: true }).click()
  await expect(page.getByRole("status")).toHaveText("Record shop & café added.")
  await page.reload()
  await expect(page.getByRole("button", { name: "Remove Record shop & café" })).toBeVisible()
  await page.getByLabel("Type name").fill("record SHOP & café")
  await page.getByRole("button", { name: "Add type", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("already exists")

  await openAdd(page)
  await page.getByTestId("pin-map").click()
  await page.getByLabel("Name", { exact: true }).fill("The vinyl corner")
  await page.getByRole("combobox", { name: "Type", exact: true }).click()
  await page.getByRole("option", { name: "Record shop & café", exact: true }).click()
  await page.getByRole("button", { name: "Save place", exact: true }).click()
  await expect(page.getByRole("heading", { name: "The vinyl corner" })).toBeVisible()
  const placeUrl = page.url()
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await page.getByRole("combobox", { name: "Type", exact: true }).click()
  await page.getByRole("option", { name: "Beach", exact: true }).click()
  await page.getByRole("button", { name: "Save changes" }).click()
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  await expect(page.getByText("Beach", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await page.getByRole("combobox", { name: "Type", exact: true }).click()
  await page.getByRole("option", { name: "Record shop & café", exact: true }).click()
  await page.getByRole("button", { name: "Save changes" }).click()
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  await expect(page.getByText("Record shop & café", { exact: true })).toBeVisible()
  await page.goto("/?scope=all")
  await page.getByRole("button", { name: "Filters", exact: true }).click()
  await page.getByRole("combobox", { name: "Filter by type" }).click()
  await page.getByRole("option", { name: "Record shop & café", exact: true }).click()
  await expect(page.getByText("The vinyl corner", { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("combobox", { name: "Filter by type" })).toContainText(
    "Record shop & café",
  )

  await page.goto("/settings/place-types")
  await page.screenshot({ path: "/tmp/placard-place-types.png", fullPage: true })
  await page.getByRole("button", { name: "Remove Record shop & café" }).click()
  await expect(page.getByRole("button", { name: "Remove Record shop & café" })).toHaveCount(0)
  await page.goto(placeUrl)
  await expect(page.getByRole("heading", { name: "The vinyl corner" })).toBeVisible()
  await expect(page.getByText("Record shop & café", { exact: true })).toBeVisible()
})
