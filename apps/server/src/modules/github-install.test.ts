import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import {
  fetchLatestRelease,
  isNewerSemver,
  parseGithubRepoUrl,
  pickReleaseAsset,
} from "./github-install.ts"

describe("parseGithubRepoUrl", () => {
  it("accepts owner/repo shorthand", () => {
    expect(parseGithubRepoUrl("Acme/my-plugin")).toEqual({
      owner: "Acme",
      repo: "my-plugin",
      repoUrl: "https://github.com/Acme/my-plugin",
    })
  })

  it("accepts https URLs and strips .git / extra path", () => {
    expect(parseGithubRepoUrl("https://github.com/Acme/my-plugin.git")).toEqual({
      owner: "Acme",
      repo: "my-plugin",
      repoUrl: "https://github.com/Acme/my-plugin",
    })
    expect(parseGithubRepoUrl("https://github.com/Acme/my-plugin/releases/tag/v1")).toEqual({
      owner: "Acme",
      repo: "my-plugin",
      repoUrl: "https://github.com/Acme/my-plugin",
    })
  })

  it("rejects non-GitHub URLs", () => {
    expect(parseGithubRepoUrl("https://gitlab.com/Acme/my-plugin")).toBeNull()
    expect(parseGithubRepoUrl("not a url")).toBeNull()
    expect(parseGithubRepoUrl("")).toBeNull()
  })
})

describe("pickReleaseAsset", () => {
  it("prefers .placard-module over zip", () => {
    const asset = pickReleaseAsset([
      {
        name: "plugin.zip",
        browserDownloadUrl: "https://example/plugin.zip",
        size: 10,
      },
      {
        name: "plugin.placard-module",
        browserDownloadUrl: "https://example/plugin.placard-module",
        size: 10,
      },
    ])
    expect(asset?.name).toBe("plugin.placard-module")
  })

  it("skips source-like zips when another zip exists", () => {
    const asset = pickReleaseAsset([
      {
        name: "my-plugin-v1.2.3.zip",
        browserDownloadUrl: "https://example/src.zip",
        size: 10,
      },
      {
        name: "my-plugin.placard.zip",
        browserDownloadUrl: "https://example/plugin.zip",
        size: 10,
      },
    ])
    expect(asset?.name).toBe("my-plugin.placard.zip")
  })
})

describe("isNewerSemver", () => {
  it("compares core versions", () => {
    expect(isNewerSemver("1.2.0", "1.1.9")).toBe(true)
    expect(isNewerSemver("1.1.9", "1.2.0")).toBe(false)
    expect(isNewerSemver("1.2.0", "1.2.0")).toBe(false)
    expect(isNewerSemver("v2.0.0", "1.9.9")).toBe(true)
  })
})

describe("module releases", () => {
  it("preserves the module selector in install and update URLs", () => {
    expect(parseGithubRepoUrl("JobiJoba/plugins#places.menus")).toEqual({
      owner: "JobiJoba",
      repo: "plugins",
      moduleId: "places.menus",
      repoUrl: "https://github.com/JobiJoba/plugins#places.menus",
    })
    expect(parseGithubRepoUrl("https://github.com/JobiJoba/plugins#places.pick")?.moduleId).toBe(
      "places.pick",
    )
    expect(parseGithubRepoUrl("JobiJoba/plugins#../bad")).toBeNull()
    expect(parseGithubRepoUrl("JobiJoba/plugins#")).toBeNull()
    expect(parseGithubRepoUrl("JobiJoba/plugins#places.pick#extra")).toBeNull()
  })

  it.effect("selects each module independently, skips previews, and paginates", () =>
    Effect.gen(function* () {
      const calls: string[] = []
      const release = (tag_name: string, prerelease = false) => ({
        tag_name,
        prerelease,
        draft: false,
        assets: [],
      })
      const layer = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request, url) =>
          Effect.sync(() => {
            calls.push(url.toString())
            const body = url.pathname.endsWith("/latest")
              ? release("v9.0.0")
              : url.searchParams.get("page") === "1"
                ? [
                    release("places.pick@0.2.0"),
                    release("places.menus@1.0.0-beta", true),
                    ...Array.from({ length: 98 }, (_, i) => release(`other.module@0.0.${i}`)),
                  ]
                : [release("places.menus@0.1.0")]
            return HttpClientResponse.fromWeb(request, Response.json(body))
          }),
        ),
      )
      const menus = yield* fetchLatestRelease("JobiJoba", "plugins", "places.menus").pipe(
        Effect.provide(layer),
      )
      expect(menus.tagName).toBe("places.menus@0.1.0")
      expect(calls).toHaveLength(2)
      const pick = yield* fetchLatestRelease("JobiJoba", "plugins", "places.pick").pipe(
        Effect.provide(layer),
      )
      expect(pick.tagName).toBe("places.pick@0.2.0")
      const legacy = yield* fetchLatestRelease("JobiJoba", "old").pipe(Effect.provide(layer))
      expect(legacy.tagName).toBe("v9.0.0")
    }),
  )
})
