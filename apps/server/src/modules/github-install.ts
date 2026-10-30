import { ModuleInstallFailed } from "@placard/domain"
import { Effect, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { MAX_ZIP_BYTES } from "./package-zip.ts"

export interface GithubRepoRef {
  readonly owner: string
  readonly repo: string
  readonly repoUrl: string
}

export interface GithubReleaseAsset {
  readonly name: string
  readonly browserDownloadUrl: string
  readonly size: number
}

export interface GithubLatestRelease {
  readonly tagName: string
  readonly assets: ReadonlyArray<GithubReleaseAsset>
}

const GithubReleaseResponse = Schema.Struct({
  tag_name: Schema.String,
  assets: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      browser_download_url: Schema.String,
      size: Schema.Number,
    }),
  ),
})

const fail = (message: string) => new ModuleInstallFailed({ message })

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "placard",
  "X-GitHub-Api-Version": "2022-11-28",
} as const

/** Parse a public GitHub repo URL or `owner/repo` shorthand. */
export const parseGithubRepoUrl = (raw: string): GithubRepoRef | null => {
  const trimmed = raw.trim()
  if (trimmed === "") return null

  const shorthand = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  if (shorthand) {
    const owner = shorthand[1]!
    const repo = shorthand[2]?.replace(/\.git$/i, "")
    return { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` }
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (!/^(www\.)?github\.com$/i.test(url.hostname)) return null

  const parts = url.pathname.split("/").filter(Boolean)
  if (parts.length < 2) return null
  const owner = parts[0]!
  const repo = parts[1]?.replace(/\.git$/i, "")
  if (!owner || !repo) return null
  return { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` }
}

const isSourceLikeName = (name: string): boolean => {
  const lower = name.toLowerCase()
  if (lower.includes("source")) return true
  // GitHub's automatic source archives: repo-v1.2.3.zip / repo-tag.zip
  if (/^[a-z0-9_.-]+-v?\d+\.\d+.*\.zip$/i.test(name)) return true
  return false
}

/** Prefer `.placard-module`, then a non-source `.zip`. */
export const pickReleaseAsset = (
  assets: ReadonlyArray<GithubReleaseAsset>,
): GithubReleaseAsset | null => {
  const placard = assets.find((a) => a.name.toLowerCase().endsWith(".placard-module"))
  if (placard) return placard

  const zips = assets.filter((a) => a.name.toLowerCase().endsWith(".zip"))
  if (zips.length === 0) return null
  const nonSource = zips.filter((a) => !isSourceLikeName(a.name))
  return nonSource[0] ?? zips[0] ?? null
}

/** True when `remote` is a strictly greater semver than `installed` (best-effort). */
export const isNewerSemver = (remote: string, installed: string): boolean => {
  const parse = (v: string) => {
    const cleaned = v.trim().replace(/^v/i, "")
    const core = cleaned.split(/[-+]/)[0] ?? cleaned
    const parts = core.split(".").map((p) => {
      const n = Number.parseInt(p, 10)
      return Number.isFinite(n) ? n : 0
    })
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0] as const
  }
  const a = parse(remote)
  const b = parse(installed)
  for (let i = 0; i < 3; i++) {
    if (a[i]! > b[i]!) return true
    if (a[i]! < b[i]!) return false
  }
  return false
}

export const fetchLatestRelease = (
  owner: string,
  repo: string,
): Effect.Effect<GithubLatestRelease, ModuleInstallFailed, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const request = HttpClientRequest.get(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`,
    ).pipe(HttpClientRequest.setHeaders(GITHUB_HEADERS))
    const response = yield* client
      .execute(request)
      .pipe(
        Effect.mapError((cause) =>
          fail(`Could not reach GitHub: ${cause instanceof Error ? cause.message : String(cause)}`),
        ),
      )
    if (response.status === 404) {
      return yield* fail(
        `No public releases found for ${owner}/${repo}. Publish a Release with a plugin zip asset.`,
      )
    }
    if (response.status === 403) {
      return yield* fail("GitHub rate limit or access denied. Try again later.")
    }
    if (response.status < 200 || response.status >= 300) {
      return yield* fail(`GitHub returned HTTP ${response.status} for ${owner}/${repo}.`)
    }
    const json = yield* response.json.pipe(
      Effect.mapError(() => fail("GitHub release response was not JSON.")),
    )
    const decoded = yield* Schema.decodeUnknownEffect(GithubReleaseResponse)(json).pipe(
      Effect.mapError(() => fail("GitHub release response was unexpected.")),
    )
    return {
      tagName: decoded.tag_name,
      assets: decoded.assets.map((a) => ({
        name: a.name,
        browserDownloadUrl: a.browser_download_url,
        size: a.size,
      })),
    }
  })

export const downloadReleaseAsset = (
  asset: GithubReleaseAsset,
): Effect.Effect<Buffer, ModuleInstallFailed, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    if (asset.size > MAX_ZIP_BYTES) {
      return yield* fail(`Release asset is too large (max ${MAX_ZIP_BYTES / (1024 * 1024)} MB).`)
    }
    const client = yield* HttpClient.HttpClient
    const request = HttpClientRequest.get(asset.browserDownloadUrl).pipe(
      HttpClientRequest.setHeaders({
        Accept: "application/octet-stream",
        "User-Agent": "placard",
      }),
    )
    const response = yield* client
      .execute(request)
      .pipe(
        Effect.mapError((cause) =>
          fail(
            `Could not download release asset: ${cause instanceof Error ? cause.message : String(cause)}`,
          ),
        ),
      )
    if (response.status < 200 || response.status >= 300) {
      return yield* fail(`Download failed with HTTP ${response.status}.`)
    }
    const bytes = yield* response.arrayBuffer.pipe(
      Effect.mapError(() => fail("Could not read the release asset body.")),
    )
    const buffer = Buffer.from(bytes)
    if (buffer.byteLength === 0) return yield* fail("Release asset is empty.")
    if (buffer.byteLength > MAX_ZIP_BYTES) {
      return yield* fail(`Release asset is too large (max ${MAX_ZIP_BYTES / (1024 * 1024)} MB).`)
    }
    return buffer
  })

/** Fetch latest release + chosen asset bytes for a public repo. */
export const fetchLatestPluginZip = (
  ref: GithubRepoRef,
): Effect.Effect<
  {
    readonly release: GithubLatestRelease
    readonly asset: GithubReleaseAsset
    readonly bytes: Buffer
  },
  ModuleInstallFailed,
  HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const release = yield* fetchLatestRelease(ref.owner, ref.repo)
    const asset = pickReleaseAsset(release.assets)
    if (!asset) {
      return yield* fail(
        `Release ${release.tagName} has no .zip or .placard-module asset. Attach a prebuilt plugin package.`,
      )
    }
    const bytes = yield* downloadReleaseAsset(asset)
    return { release, asset, bytes }
  })
