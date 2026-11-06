import Link from "next/link"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type Column<Row> = {
  key: string
  header: string
  /** Numbers right-aligned in tabular figures (admin-design.md §2). */
  align?: "start" | "end"
  /** Hidden below this breakpoint so phones keep the essentials. */
  hideBelow?: "sm" | "md" | "lg"
  render: (row: Row) => ReactNode
}

const hide = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" }

/**
 * A server-rendered list table (the filtering, sorting and paging live in the URL, so the table
 * itself has no client state). The first column links to the row's page when `href` is given.
 */
export function DataTable<Row>({ caption, columns, rows, rowKey, href, empty }: { caption: string; columns: Column<Row>[]; rows: Row[]; rowKey: (row: Row) => string; href?: (row: Row) => string; empty?: ReactNode }) {
  if (rows.length === 0 && empty) return <>{empty}</>
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-background">
      <table className="w-full border-collapse text-16">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface text-14 text-subtle-foreground">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cn("h-10 px-3 font-semibold whitespace-nowrap", column.align === "end" ? "text-end" : "text-start", column.hideBelow && hide[column.hideBelow])}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-border transition-colors hover:bg-surface">
              {columns.map((column, index) => (
                <td key={column.key} className={cn("h-12 px-3 align-middle", column.align === "end" ? "text-end tabular-nums" : "text-start", column.hideBelow && hide[column.hideBelow])}>
                  {index === 0 && href ? (
                    <Link href={href(row)} className="font-semibold underline-offset-4 hover:underline">
                      {column.render(row)}
                    </Link>
                  ) : (
                    column.render(row)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
