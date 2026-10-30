import { expect, type Page } from "@playwright/test"

export const admin = {
  name: "Ada Admin",
  email: "ada@example.com",
  password: "correct horse battery",
}

export const signIn = async (page: Page, user: { email: string; password: string }) => {
  await page.goto("/login")
  await page.getByLabel("Email").fill(user.email)
  await page.getByLabel("Password").fill(user.password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

/** Signs in as the admin, creating the account first if this spec runs on its own. */
export const signInAsAdmin = async (page: Page, baseURL: string) => {
  const setup = await page.request.get("/api/setup")
  if ((await setup.json()).signupOpen) {
    await page.request.post("/api/auth/sign-up/email", {
      data: admin,
      headers: { origin: new URL(baseURL).origin },
    })
  }
  await signIn(page, admin)
  await page.getByRole("navigation", { name: "Main" }).waitFor()
}

/** Open the desktop More menu (Add / Lists / Settings live here, not in primary nav). */
export const openMore = async (page: Page) => {
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).click()
}

/** Navigate via Main (Library) or More menuitems (Add, Lists, Settings, …). */
export const openNav = async (page: Page, name: string) => {
  if (name === "Library") {
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Library", exact: true })
      .click()
    return
  }
  await openMore(page)
  await page.getByRole("menuitem", { name, exact: true }).click()
}

export const openAdd = (page: Page) => openNav(page, "Add")

/**
 * Library defaults to Near me. Without geolocation the empty crate / place grid is hidden.
 * Switch to All so empty-state and browse assertions work in CI.
 */
export const browseAllPlaces = async (page: Page) => {
  if (new URL(page.url()).pathname !== "/") {
    await openNav(page, "Library")
  }
  const showAll = page.getByRole("button", { name: "Show all places" })
  if (await showAll.isVisible().catch(() => false)) {
    await showAll.click()
  }
  const all = page.getByRole("radio", { name: "All" })
  if (await all.count()) {
    await all.click()
  }
  await expect(all).toBeChecked()
}

/** Assert the empty-library welcome (after switching off Near me if needed). */
export const expectEmptyLibrary = async (page: Page) => {
  await browseAllPlaces(page)
  await expect(page.getByRole("heading", { name: "Start your crate" })).toBeVisible()
}
