import "server-only"
import { createDemoTables } from "./store"
import type { FixtureTables } from "./tables"

export function demoFixture(): string {
  return JSON.stringify({ kind: "isolated-qa-demo", version: 1, tables: createDemoTables() }, (_key, value) => value instanceof Map ? { mapEntries: [...value] } : value, 2) + "\n"
}

export function readDemoFixture(source: string): FixtureTables {
  const value = JSON.parse(source, (_key, row) => row && typeof row === "object" && Array.isArray(row.mapEntries) ? new Map(row.mapEntries) : row) as { kind: string; version: number; tables: FixtureTables }
  if (value.kind !== "isolated-qa-demo" || value.version !== 1 || value.tables.stores.length !== 1 || [value.tables.customers, value.tables.staffMembers, value.tables.sessions, value.tables.staffSessions, value.tables.orders, value.tables.outbox, value.tables.audit].some((rows) => rows.length > 0)) throw new Error("The demo fixture must contain public sample configuration only")
  return value.tables
}
