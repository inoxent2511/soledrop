import { uuidv7 } from "@/server/db/uuid"

/** Time-ordered application key; imported legacy keys remain unchanged. */
export function newId(): string {
  return uuidv7()
}

/** Current time as an ISO string; one seam so tests can reason about time. */
export function now(): string {
  return new Date().toISOString()
}
