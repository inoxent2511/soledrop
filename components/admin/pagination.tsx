import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"

import { adminButton } from "@/components/admin/button"
import { cn } from "@/lib/utils"

/** "Showing 26–50 of 312" with previous/next links that keep every other URL parameter. */
export function Pagination({ basePath, params, page, pageSize, total }: { basePath: string; params: Record<string, string | undefined>; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const link = (target: number) => {
    const search = new URLSearchParams(Object.entries({ ...params, page: target > 1 ? String(target) : undefined }).filter((entry): entry is [string, string] => Boolean(entry[1])))
    const query = search.toString()
    return query ? `${basePath}?${query}` : basePath
  }
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(total, page * pageSize)
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 text-14 text-subtle-foreground">
      <p aria-live="polite">{total === 0 ? "No results" : `Showing ${first.toLocaleString("en-US")}–${last.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`}</p>
      <div className="flex items-center gap-2">
        <Link href={link(page - 1)} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} className={cn(adminButton({ tone: "secondary", size: "sm" }))}>
          <ChevronLeft aria-hidden className="rtl:rotate-180" /> Previous
        </Link>
        <span>
          Page {page} of {pages}
        </span>
        <Link href={link(page + 1)} aria-disabled={page >= pages} tabIndex={page >= pages ? -1 : undefined} className={cn(adminButton({ tone: "secondary", size: "sm" }))}>
          Next <ChevronRight aria-hidden className="rtl:rotate-180" />
        </Link>
      </div>
    </nav>
  )
}
