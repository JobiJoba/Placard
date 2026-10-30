import { expect, type Page, test } from "@playwright/test"
import { browseAllPlaces, openAdd, openNav, signInAsAdmin } from "./support.ts"

// The server runs with PLACARD_FAKE_GOOGLE, so Google calls are answered from fixtures.
test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "needs the fake Google layer")
test.describe.configure({ mode: "serial" })

const MICHELE = "L'Antica Pizzeria da Michele"
let micheleUrl = ""

test.beforeEach(async ({ page, baseURL }) => {
  await page.route(/tile\.openstreetmap\.org|maps\.googleapis\.com/, (route) => route.abort())
  await signInAsAdmin(page, baseURL as string)
})

const searchFor = async (page: Page, text: string) => {
  await openAdd(page)
  await page.getByLabel("Search Google Maps").fill(text)
  await page
    .getByRole("list", { name: "Suggestions" })
    .getByRole("button", { name: MICHELE })
    .click()
}

test("without a Google key, a place is added by dropping a pin", async ({ page }) => {
  await openAdd(page)
  await expect(page.getByText(/need a Google API key/)).toBeVisible()
  await expect(page.getByRole("tab")).toHaveCount(0)

  await page.getByTestId("pin-map").click()
  await expect(page.getByText(/^Pinned at /)).toBeVisible()
  await page.getByLabel("Name").fill("Secret viewpoint")
  await page.getByRole("combobox", { name: "Type" }).click()
  await page.getByRole("option", { name: "Trail" }).click()
  await page.getByRole("button", { name: "Save place" }).click()

  await expect(page.getByRole("heading", { name: "Secret viewpoint" })).toBeVisible()
  await expect(page.getByText("Dropped pin", { exact: false })).toBeVisible()
  const google = page.getByRole("link", { name: "Open in Google Maps" })
  await expect(google).toHaveAttribute("href", /query=-?\d+\.\d+%2C-?\d+\.\d+/)
})

test("with a key, a restaurant is added by typing its name", async ({ page }) => {
  await openNav(page, "Settings")
  await page.getByRole("link", { name: "Integrations" }).click()
  await page.getByLabel("New key").fill("fake-key")
  await page.getByRole("button", { name: "Test and save" }).click()
  await expect(page.getByText("Key works and is saved.")).toBeVisible()

  await searchFor(page, "michele")
  const preview = page.getByLabel("Place preview")
  await expect(preview).toContainText("Via Cesare Sersale, 1, 80139 Napoli NA, Italy")
  await preview.getByRole("button", { name: "Add to library" }).click()

  await expect(page.getByRole("heading", { name: MICHELE })).toBeVisible()
  await expect(page.getByText("Restaurant", { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute(
    "href",
    /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&.*query_place_id=ChIJ-fixture-da-michele/,
  )
  micheleUrl = page.url()

  await browseAllPlaces(page)
  await expect(page.getByRole("link", { name: new RegExp(MICHELE) })).toBeVisible()
  await expect(page.getByRole("link", { name: /Secret viewpoint/ })).toBeVisible()
})

test("adding the same restaurant again lands on its existing card", async ({ page }) => {
  await searchFor(page, "pizzeria")
  const preview = page.getByLabel("Place preview")
  await expect(preview).toContainText("Already in your library.")
  await expect(preview.getByRole("button", { name: "Add to library" })).toHaveCount(0)
  await preview.getByRole("link", { name: "Open it" }).click()

  expect(page.url()).toBe(micheleUrl)
  await expect(page.getByText("This place is already in your library.")).toBeVisible()
})

test("a removed place leaves the library", async ({ page }) => {
  await page.goto(micheleUrl)
  await page.getByRole("button", { name: "Remove from library" }).click()
  await page.getByRole("button", { name: "Remove", exact: true }).click()
  await expect(page).toHaveURL(/\/deleted$/)
  await page.getByRole("link", { name: "Back to library" }).click()
  await browseAllPlaces(page)
  await expect(page.getByRole("link", { name: /Secret viewpoint/ })).toBeVisible()
  await expect(page.getByRole("link", { name: new RegExp(MICHELE) })).toHaveCount(0)
})
