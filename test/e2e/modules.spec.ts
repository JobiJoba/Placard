import { expect, test } from "@playwright/test"
import { signInAsAdmin } from "./support"

for (const mobile of [false, true]) {
  test(`module visibility updates ${mobile ? "mobile" : "desktop"} navigation without reloading`, async ({
    page,
    baseURL,
  }) => {
    let visible = true
    let failUpdate = true
    const moduleView = () => ({
      id: "demo.navigation",
      name: "Navigation demo",
      version: "0.1.0",
      description: "Navigation test module",
      visible,
      mcpEnabled: true,
      hasNavigation: true,
      source: "upload",
      iconUrl: null,
      nav: visible ? [{ path: "/m/demo.navigation", label: "Demo", slot: "primary" }] : [],
      webRoutes: [],
      actions: [],
      mcpTools: [],
      webEntryUrl: null,
    })
    await page.route("**/api/modules/me", (route) => route.fulfill({ json: [moduleView()] }))
    await page.route("**/api/modules/me/demo.navigation", async (route) => {
      if (failUpdate) {
        await route.fulfill({ status: 500, json: { message: "Could not save visibility" } })
        return
      }
      visible = route.request().postDataJSON().visible
      await route.fulfill({ json: moduleView() })
    })

    await signInAsAdmin(page, baseURL ?? "http://localhost:3100")
    // Navigate within the SPA; the test server only serves HTML at the root.
    await page.evaluate(() => {
      window.history.pushState({}, "", "/settings/modules/demo.navigation")
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    const nav = page.getByRole("navigation", { name: mobile ? "Primary" : "Main", exact: true })
    const link = nav.getByRole("link", { name: "Demo", exact: true })
    await expect(link).toBeVisible()

    let documentLoads = 0
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentLoads++
    })
    // A failed save must leave both the settings button and navigation unchanged.
    await page.getByRole("button", { name: "Shown in nav", exact: true }).click()
    await expect(page.getByRole("alert")).toBeVisible()
    await expect(link).toBeVisible()
    await expect(page.getByRole("button", { name: "Shown in nav", exact: true })).toBeEnabled()

    failUpdate = false
    await page.getByRole("button", { name: "Shown in nav", exact: true }).click()
    await expect(link).toHaveCount(0)
    await page.getByRole("button", { name: "Hidden from nav", exact: true }).click()
    await expect(link).toBeVisible()
    expect(documentLoads).toBe(0)
    await expect(page).toHaveURL(/\/settings\/modules\/demo.navigation$/)
  })
}

for (const failure of ["load", "render"]) {
  test(`place module ${failure} failure is isolated from the place page`, async ({
    page,
    baseURL,
  }) => {
    await signInAsAdmin(page, baseURL ?? "http://localhost:3100")
    const response = await page.request.post("/api/places/manual", {
      headers: { origin: baseURL ?? "http://localhost:3100" },
      data: {
        name: `Section failure ${failure}`,
        category: "restaurant",
        location: { lat: 50, lng: 4 },
        address: null,
      },
    })
    expect(response.ok()).toBeTruthy()
    const id = (await response.json()).place.id
    await page.route("**/api/modules/me", (route) =>
      route.fulfill({
        json: [
          {
            id: "demo.sections",
            name: "Sections",
            version: "1.0.0",
            description: "Fixture",
            visible: true,
            mcpEnabled: false,
            hasNavigation: false,
            source: "upload",
            iconUrl: null,
            nav: [],
            webRoutes: [],
            actions: [],
            mcpTools: [],
            placeSections: [{ id: "broken", label: "Broken section", exportName: "Broken" }],
            webEntryUrl: "/fixture-module.js",
          },
        ],
      }),
    )
    await page.route("**/fixture-module.js", (route) =>
      failure === "load"
        ? route.abort()
        : route.fulfill({
            contentType: "application/javascript",
            body: "export function Broken(){ throw new Error('fixture render error') }",
          }),
    )
    await page.goto("/")
    await page.getByRole("navigation", { name: "Main", exact: true }).waitFor()
    await page.evaluate((id) => {
      history.pushState({}, "", `/places/${id}`)
      dispatchEvent(new PopStateEvent("popstate"))
    }, id)
    await expect(
      page.getByText(
        failure === "load"
          ? "Could not load this module section."
          : "Could not display Broken section.",
      ),
    ).toBeVisible()
    await expect(page.getByRole("heading", { name: `Section failure ${failure}` })).toBeVisible()
    await expect(page.getByRole("link", { name: "Open in Google Maps" })).toBeVisible()
  })
}
