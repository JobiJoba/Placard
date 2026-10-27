import type { OpeningHours } from "@placard/domain"

const MINUTES_PER_DAY = 24 * 60
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY

/** Google day: 0 = Sunday … 6 = Saturday. */
export interface LocalClock {
  readonly day: number
  readonly hour: number
  readonly minute: number
}

export const toLocalClock = (utcMillis: number, utcOffsetMinutes: number): LocalClock => {
  const local = new Date(utcMillis + utcOffsetMinutes * 60_000)
  return {
    day: local.getUTCDay(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
  }
}

const toWeekMinute = (day: number, hour: number, minute: number) =>
  day * MINUTES_PER_DAY + hour * 60 + minute

const normalizeWeekMinute = (value: number) => {
  const mod = value % MINUTES_PER_WEEK
  return mod < 0 ? mod + MINUTES_PER_WEEK : mod
}

/** True when `at` falls inside any regularOpeningHours period. */
export const isOpenAt = (
  hours: OpeningHours | null | undefined,
  utcOffsetMinutes: number | null | undefined,
  utcMillis: number,
): boolean => {
  if (!hours?.periods?.length) return false
  const offset = utcOffsetMinutes ?? 0
  const local = toLocalClock(utcMillis, offset)
  const now = toWeekMinute(local.day, local.hour, local.minute)

  for (const period of hours.periods) {
    const open = toWeekMinute(period.open.day, period.open.hour, period.open.minute)
    if (!period.close) {
      // Open with no close: treat as open for 24 hours from open.
      const close = normalizeWeekMinute(open + MINUTES_PER_DAY)
      if (inHalfOpenWeekRange(now, open, close)) return true
      continue
    }
    const close = toWeekMinute(period.close.day, period.close.hour, period.close.minute)
    if (inHalfOpenWeekRange(now, open, close === open ? normalizeWeekMinute(open + MINUTES_PER_DAY) : close)) {
      return true
    }
  }
  return false
}

const inHalfOpenWeekRange = (now: number, open: number, close: number): boolean => {
  if (open === close) return true // 24/7 style edge
  if (open < close) return now >= open && now < close
  // Wraps over week boundary (e.g. Sat night → Sun morning).
  return now >= open || now < close
}

/**
 * Open at dinner time tonight (19:00 local), or open now if it's already past 19:00 local.
 * Places without hours never match.
 */
export const isOpenTonight = (
  hours: OpeningHours | null | undefined,
  utcOffsetMinutes: number | null | undefined,
  utcMillis: number,
): boolean => {
  if (!hours?.periods?.length) return false
  const offset = utcOffsetMinutes ?? 0
  const local = toLocalClock(utcMillis, offset)
  if (local.hour > 19 || (local.hour === 19 && local.minute > 0)) {
    return isOpenAt(hours, utcOffsetMinutes, utcMillis)
  }
  // Build a UTC instant that is 19:00 local on the same local calendar day.
  const localMidnightUtc = utcMillis - (local.hour * 60 + local.minute) * 60_000
  const dinnerUtc = localMidnightUtc + 19 * 60 * 60_000
  return isOpenAt(hours, utcOffsetMinutes, dinnerUtc)
}

/** Format meters using the user's distance unit preference. */
export const formatDistance = (
  meters: number,
  unit: "km" | "mi",
): string => {
  if (unit === "mi") {
    const miles = meters / 1609.344
    return miles < 0.1 ? `${Math.round(meters * 3.28084)} ft` : `${miles.toFixed(miles < 10 ? 1 : 0)} mi`
  }
  const km = meters / 1000
  return km < 1 ? `${Math.round(meters)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`
}
