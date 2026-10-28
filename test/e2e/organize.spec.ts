import { expect, test } from "@playwright/test"
import { signInAsAdmin } from "./support.ts"

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "needs a fresh install")
test.describe.configure({ mode: "serial" })

test.beforeEach(async ({ page, baseURL }) => {
  await page.route(/tile\.openstreetmap\.org|maps\.googleapis\.com/, (route) => route.abort())
  await signInAsAdmin(page, baseURL as string)
})

const dropPin = async (
  page: import("@playwright/test").Page,
  name: string,
  category = "Restaurant",
) => {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Add" }).click()
  // Without a Google key the pin form is the only option.
  if (await page.getByRole("tab", { name: "Drop a pin" }).count()) {
    await page.getByRole("tab", { name: "Drop a pin" }).click()
  }
  await page.getByTestId("pin-map").click()
  await page.getByLabel("Name").fill(name)
  await page.getByRole("combobox", { name: "Type" }).click()
  await page.getByRole("option", { name: category }).click()
  await page.getByRole("button", { name: "Save place" }).click()
  await expect(page.getByRole("heading", { name })).toBeVisible()
}

test("create a list, tag a place, edit it, bulk-delete and restore", async ({ page }) => {
  await dropPin(page, "Da Michele")
  await dropPin(page, "Sorbillo")
  await dropPin(page, "Starita")

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Lists" }).click()
  await page.getByLabel("New list").fill("Italian restaurants")
  await page.getByRole("button", { name: "Create" }).click()
  await expect(page.getByRole("link", { name: "Italian restaurants" })).toBeVisible()

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Library" })
    .click()
  for (const name of ["Da Michele", "Sorbillo", "Starita"]) {
    await page.getByRole("checkbox", { name: `Select ${name}` }).check()
  }
  await page.getByRole("button", { name: "Add to list" }).click()
  await page.getByRole("menuitem", { name: "Italian restaurants" }).click()
  await expect(page.getByText("selected")).toHaveCount(0)

  await page.getByRole("link", { name: /Da Michele/ }).click()
  await page.getByRole("button", { name: "Edit" }).click()
  await page.getByLabel("Tags").fill("date-night")
  await page.getByLabel("Status").click()
  await page.getByRole("option", { name: "Been there" }).click()
  await page.getByLabel("Name").fill("L'Antica da Michele")
  await page.getByRole("button", { name: "Save changes" }).click()
  await expect(page.getByRole("heading", { name: "L'Antica da Michele" })).toBeVisible()
  await expect(page.getByText("Been there", { exact: true })).toBeVisible()
  await expect(page.getByText("date-night", { exact: true })).toBeVisible()

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Library" })
    .click()
  await page.getByRole("checkbox", { name: "Select L'Antica da Michele" }).check()
  await page.getByRole("checkbox", { name: "Select Sorbillo" }).check()
  await page.getByRole("button", { name: "Delete" }).click()
  await expect(page.getByRole("link", { name: /Starita/ })).toBeVisible()
  await expect(page.getByRole("link", { name: /Sorbillo/ })).toHaveCount(0)

  await page.getByRole("link", { name: "Recently deleted" }).click()
  await expect(page.getByText("L'Antica da Michele")).toBeVisible()
  await page.getByRole("button", { name: "Restore", exact: true }).first().click()
  await page.getByRole("link", { name: "Back to library" }).click()
  await expect(page.getByRole("link", { name: /L'Antica da Michele|Starita/ })).toHaveCount(2)
})
