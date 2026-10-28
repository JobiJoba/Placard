import { Buffer } from "node:buffer"
import { expect, test } from "@playwright/test"
import { signInAsAdmin } from "./support.ts"

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "needs the local stack")
test.describe.configure({ mode: "serial" })

/** 2×2 PNG */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH+aAAAAAElFTkSuQmCC",
  "base64",
)

test.beforeEach(async ({ page, baseURL }) => {
  await page.route(/tile\.openstreetmap\.org|maps\.googleapis\.com/, (route) => route.abort())
  await signInAsAdmin(page, baseURL as string)
})

test("upload a dish photo and see it on the place card", async ({ page }) => {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Add" }).click()
  await page.getByTestId("pin-map").click()
  await page.getByLabel("Name").fill("Photo test trattoria")
  await page.getByRole("combobox", { name: "Type" }).click()
  await page.getByRole("option", { name: "Restaurant" }).click()
  await page.getByRole("button", { name: "Save place" }).click()
  await expect(page.getByRole("heading", { name: "Photo test trattoria" })).toBeVisible()

  await expect(page.getByRole("heading", { name: "Photos" })).toBeVisible()
  await page.getByLabel("Caption (optional)").fill("Cacio e pepe")
  await page.getByRole("button", { name: "Dish" }).click()

  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Add photo" }).click(),
  ])
  await fileChooser.setFiles({
    name: "cacio.png",
    mimeType: "image/png",
    buffer: PNG,
  })

  await expect(page.getByText("Cacio e pepe")).toBeVisible()
  await expect(page.getByRole("img", { name: "Cacio e pepe" })).toBeVisible()

  await page.reload()
  await expect(page.getByRole("heading", { name: "Photo test trattoria" })).toBeVisible()
  await expect(page.getByRole("img", { name: "Cacio e pepe" })).toBeVisible()
})
