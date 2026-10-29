/** Simple sliding-window rate limit per token (in-process; fine for single-instance deploys). */
export type RateLimiter = {
  readonly allow: (tokenId: string) => boolean
}

export const createRateLimiter = (opts?: {
  readonly limit?: number
  readonly windowMs?: number
}): RateLimiter => {
  const limit = opts?.limit ?? 60
  const windowMs = opts?.windowMs ?? 60_000
  const hits = new Map<string, number[]>()

  return {
    allow: (tokenId) => {
      const now = Date.now()
      const recent = (hits.get(tokenId) ?? []).filter((t) => now - t < windowMs)
      if (recent.length >= limit) {
        hits.set(tokenId, recent)
        return false
      }
      recent.push(now)
      hits.set(tokenId, recent)
      return true
    },
  }
}
