/** Application timestamps stay ISO strings; SQL sessions and DATETIME values are UTC. */
export function sqlDate(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new TypeError("Invalid date")
  return date.toISOString().slice(0, 23).replace("T", " ")
}

export function isoDate(value: string): string {
  return new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").toISOString()
}

export function nullableSqlDate(value: string | null): string | null { return value === null ? null : sqlDate(value) }
export function nullableIsoDate(value: string | null): string | null { return value === null ? null : isoDate(value) }
export function sqlNow(): string { return sqlDate(new Date().toISOString()) }

/** Display JSON is validated on write; both engines return the same decoded representation. */
export function jsonValue<T>(value: unknown): T { return value as T }

export function escapeLike(value: string): string { return value.replace(/[\\%_]/g, (char) => "\\" + char) }
