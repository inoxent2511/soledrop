import "@/lib/validation"
import { z } from "zod"

/** Report date ranges in Pakistan days; defaults to the last 30 days. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export function reportRange(input: Record<string, string | undefined>, now = Date.now()) {
  const today = new Date(now + 5 * 3_600_000).toISOString().slice(0, 10)
  const monthAgo = new Date(now + 5 * 3_600_000 - 29 * 86_400_000).toISOString().slice(0, 10)
  const from = day.safeParse(input.from).success ? (input.from as string) : monthAgo
  const to = day.safeParse(input.to).success ? (input.to as string) : today
  return { from, to }
}

/** Today and seven days back, as Pakistan days (the dashboard's comparison window). */
export function lastWeek(now = Date.now()) {
  const day = (at: number) => new Date(at + 5 * 3_600_000).toISOString().slice(0, 10)
  return { from: day(now - 7 * 86_400_000), to: day(now) }
}
