import { describe, expect, it } from "@effect/vitest"
import {
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
