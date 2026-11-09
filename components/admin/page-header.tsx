import Link from "next/link"
import type { ReactNode } from "react"

/** Breadcrumbs, title, description and the page's actions (admin-design.md, "Layout"). */
export function PageHeader({ title, description, crumbs = [], actions }: { title: string; description?: ReactNode; crumbs?: { label: string; href: string }[]; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        {crumbs.length > 0 ? (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 text-14 text-subtle-foreground">
              {crumbs.map((crumb) => (
                <li key={crumb.href} className="flex items-center gap-1.5">
                  <Link href={crumb.href} prefetch={false} className="underline-offset-4 hover:text-foreground hover:underline">
                    {crumb.label}
                  </Link>
                  <span aria-hidden>/</span>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className="font-display text-24 font-extrabold tracking-tight-1 md:text-28">{title}</h1>
        {description ? <p className="max-w-prose text-16 text-subtle-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
