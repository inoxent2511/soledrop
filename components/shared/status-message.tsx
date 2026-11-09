import type { ReactNode } from "react"

import { containerClasses } from "@/components/shared/container-classes"

/** Full-width message for 404, error and other dead ends: big code, heading, a line of help and the ways out. */
export function StatusMessage({ code, title, children, actions }: { code: string; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="bg-surface">
      <div className={`${containerClasses} flex flex-col items-center gap-5 py-24 text-center md:py-36`}>
        <p aria-hidden="true" className="rounded-2xl bg-brand px-6 font-display text-100 leading-none font-extrabold text-brand-foreground md:text-150">
          {code}
        </p>
        <h1 className="text-34 font-bold tracking-tight-2 md:text-54">{title}</h1>
        <div className="max-w-134 text-18 text-subtle-foreground md:text-20">{children}</div>
        <div className="flex flex-col gap-4 pt-4 sm:flex-row">{actions}</div>
      </div>
    </div>
  )
}

export const statusAction =
  "flex h-14 items-center justify-center rounded-xl bg-foreground px-8 text-20 font-semibold text-background transition-colors hover:bg-brand hover:text-brand-foreground md:h-16"
export const statusActionAlt =
  "flex h-14 items-center justify-center rounded-xl border-2 border-foreground px-8 text-20 font-semibold transition-colors hover:bg-foreground hover:text-background md:h-16"
