/** Minimal RFC 4180 CSV: quoted fields, escaped quotes, CRLF or LF line endings. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let field = ""
  let row: string[] = []
  let quoted = false
  const input = text.replace(/^﻿/, "")
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += char
  }
  if (field !== "" || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...body] = rows.filter((line) => line.some((cell) => cell.trim() !== ""))
  if (!header) return []
  const keys = header.map((key) => key.trim())
  return body.map((cells) => Object.fromEntries(keys.map((key, index) => [key, (cells[index] ?? "").trim()])))
}

/**
 * Spreadsheet formula injection: a text cell starting with = + - @ (or a tab/CR) would run as a
 * formula in Excel or Sheets, so it gets a leading apostrophe. Numbers are written as they are.
 */
export const neutralise = (value: string | number | null): string => (typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value ?? ""))

const escape = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)

export function toCsv(columns: readonly string[], rows: Record<string, string | number | null>[]): string {
  const lines = [columns.join(","), ...rows.map((row) => columns.map((column) => escape(neutralise(row[column] ?? null))).join(","))]
  return `${lines.join("\r\n")}\r\n`
}
