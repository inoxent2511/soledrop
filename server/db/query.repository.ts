import { Param, SQL, sql } from "drizzle-orm"
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core"

/** Parameterized projection constants avoid selecting PII an actor cannot see. */
export function constant<T extends string | null>(value: T): SQL<T> {
  return new SQL<T>([new Param(value)])
}

export function maskedEmail(column: AnyMySqlColumn): SQL<string> {
  return sql.fromList([sql.raw("CONCAT(LEFT("), column, sql.raw(", 1), '•••@', SUBSTRING_INDEX("), column, sql.raw(", '@', -1))")]).mapWith(String)
}

export function maskedPhone(column: AnyMySqlColumn): SQL<string | null> {
  return sql.fromList([sql.raw("IF("), column, sql.raw(" = '', '', CONCAT('•••', RIGHT(REGEXP_REPLACE("), column, sql.raw(", '[^0-9]', ''), 3)))")]).mapWith((value): string | null => value === null ? null : String(value))
}

export function firstWord(column: AnyMySqlColumn): SQL<string> {
  return sql.fromList([sql.raw("SUBSTRING_INDEX("), column, sql.raw(", ' ', 1)")]).mapWith(String)
}

export function maskedOptionalText(column: AnyMySqlColumn): SQL<string | null> {
  return sql.fromList([sql.raw("IF("), column, sql.raw(" IS NULL OR "), column, sql.raw(" = '', NULL, '•••')")]).mapWith((value: unknown) => value === null ? null : String(value))
}
