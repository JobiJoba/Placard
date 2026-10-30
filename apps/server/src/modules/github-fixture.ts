import { Effect, Layer } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { respondGoogleFixture } from "../google/fixture-client.ts"

export interface GithubReleaseFixture {
  readonly tagName: string
  readonly assetName: string
  readonly zipBytes: Uint8Array
}

/** Mutable registry for integration tests — key is `owner/repo` (lowercase). */
export const githubReleaseFixtures = new Map<string, GithubReleaseFixture>()

export const clearGithubReleaseFixtures = () => {
  githubReleaseFixtures.clear()
}

const respondGithub = (request: HttpClientRequest.HttpClientRequest, url: URL): Response | null => {
  if (url.hostname === "api.github.com") {
    const match = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/releases\/latest$/)
    if (request.method === "GET" && match) {
      const key = `${decodeURIComponent(match[1]!)}/${decodeURIComponent(match[2]!)}`.toLowerCase()
      const fixture = githubReleaseFixtures.get(key)
      if (!fixture) {
        return Response.json({ message: "Not Found" }, { status: 404 })
      }
      return Response.json({
        tag_name: fixture.tagName,
        assets: [
          {
            name: fixture.assetName,
            browser_download_url: `https://github.com/fixtures/download/${encodeURIComponent(key)}/${encodeURIComponent(fixture.assetName)}`,
            size: fixture.zipBytes.byteLength,
          },
        ],
      })
    }
    return Response.json({ message: `No GitHub API fixture for ${url}` }, { status: 404 })
  }

  if (url.hostname === "github.com" && url.pathname.startsWith("/fixtures/download/")) {
    const parts = url.pathname.split("/").filter(Boolean)
    const keySegment = parts[2]
    if (!keySegment) return Response.json({ message: "bad download path" }, { status: 404 })
    const key = decodeURIComponent(keySegment).toLowerCase()
    const fixture = githubReleaseFixtures.get(key)
    if (!fixture) return new Response("missing", { status: 404 })
    return new Response(Buffer.from(fixture.zipBytes), {
      status: 200,
      headers: { "content-type": "application/zip" },
    })
  }

  return null
}

const respond = (request: HttpClientRequest.HttpClientRequest, url: URL): Response => {
  const github = respondGithub(request, url)
  if (github) return github
  return respondGoogleFixture(request, url)
}

/**
 * Google Places fixtures plus optional GitHub Release fixtures for module install tests.
 */
export const TestHttpFixtureClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request, url) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, respond(request, url))),
  ),
)
