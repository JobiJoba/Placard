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
    await page.goto("/")
  } else {
    await signIn(page, admin)
  }
  await page.getByRole("navigation", { name: "Main" }).waitFor()
}

/** Primary destinations sit directly in the header; the rest are under More. */
const primaryNav = new Set(["Library", "Lists"])

/** Open the desktop More menu (Import / Recently deleted / Settings / plugin pages). */
export const openMore = async (page: Page) => {
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).click()
}

/** Navigate via the header: primary links, the Add button, or More menu items. */
export const openNav = async (page: Page, name: string) => {
  if (primaryNav.has(name)) {
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name, exact: true })
      .click()
    return
  }
  if (name === "Add") {
    await page.getByRole("banner").getByRole("link", { name: "Add", exact: true }).click()
    return
  }
  await openMore(page)
  await page.getByRole("menuitem", { name, exact: true }).click()
}

export const openAdd = (page: Page) => openNav(page, "Add")

/** Sign out through the desktop account menu. */
export const signOut = async (page: Page) => {
  await page.getByRole("button", { name: /^Account menu for / }).click()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
}

/**
 * Library defaults to Near me. Without geolocation the empty crate / place grid is hidden.
 * Switch to All so empty-state and browse assertions work in CI.
 */
export const browseAllPlaces = async (page: Page) => {
  let url = new URL(page.url())
  const onAuthRoute =
    url.pathname === "/setup" || url.pathname === "/login" || url.pathname.startsWith("/invite/")
  if (onAuthRoute) {
    // Don't reload mid signup/sign-in: the auth request would be aborted.
    await page.getByRole("navigation", { name: "Main" }).waitFor()
    url = new URL(page.url())
  }
  if (url.pathname !== "/") {
    await page.goto("/?scope=all")
  } else if (url.searchParams.get("scope") !== "all") {
    url.searchParams.set("scope", "all")
    url.searchParams.delete("radius")
    await page.goto(url.toString())
  }
  // The empty crate replaces the filter bar on an empty "All" library.
  await expect(
    page
      .getByRole("heading", { name: "Start your crate" })
      .or(page.getByRole("radio", { name: "All", checked: true })),
  ).toBeVisible()
}

/** Assert the empty-library welcome (after switching off Near me if needed). */
export const expectEmptyLibrary = async (page: Page) => {
  await browseAllPlaces(page)
  await expect(page.getByRole("heading", { name: "Start your crate" })).toBeVisible()
}
