import type { SearchEvent } from "./types"
import { DomainError } from "@/server/shared/errors"

export function searchWindow(days: number, limit: number, maximum = 50) {
  if (!Number.isSafeInteger(days) || !Number.isSafeInteger(limit)) throw new DomainError("validation", "Invalid search reporting window.")
  return { days: Math.max(1, days), limit: Math.max(1, Math.min(maximum, limit)) }
}

/** The reference driver keeps the same event invariants as the relational CHECKs. */
export function assertSearchEvent(event: SearchEvent): void {
  const length = (value: string) => [...value].length
  if (!event.query || length(event.query) > 100 || !event.normalized || length(event.normalized) > 100 || !["overlay", "page"].includes(event.source) || (event.resultCount === null) === (event.clickedSlug === null) || event.resultCount !== null && (!Number.isSafeInteger(event.resultCount) || event.resultCount < 0) || !Number.isFinite(Date.parse(event.createdAt))) throw new DomainError("validation", "Invalid search event.")
}
