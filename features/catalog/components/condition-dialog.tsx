"use client"

import Link from "next/link"
import { useId, useRef } from "react"

import { InfoIcon } from "@/components/icons"
import { ConditionGradeList } from "@/features/catalog/components/condition-grade-list"
import type { ConditionGrade } from "@/server/catalog/types"
import { conditionLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * The green condition chip on a pre-loved product page. Its ⓘ opens a modal with what every grade
 * means and this pair's grade highlighted, so shoppers don't have to leave the page (J-04).
 */
export function ConditionDialog({
  grade,
  onDark = false,
}: {
  grade: ConditionGrade
  /** On a black band the hover turns white, not black. */
  onDark?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const label = conditionLabel(grade)

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
        className={cn(
          "flex h-14 items-center gap-3 rounded-lg bg-success ps-5 pe-5 text-24 font-semibold tracking-tight-1 text-success-foreground transition-colors md:h-18 md:ps-7 md:pe-6.75 md:text-32",
          onDark
            ? "hover:bg-background hover:text-foreground"
            : "hover:bg-foreground"
        )}
      >
        {label}
        <InfoIcon className="size-7 md:size-8.5" />
        <span className="sr-only">: what condition grades mean</span>
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
        className="m-auto w-[min(100%-2.5rem,40rem)] rounded-3xl bg-background p-0 text-foreground backdrop:bg-foreground/60"
      >
        <div className="flex flex-col gap-6 p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-16 font-medium text-subtle-foreground">
                This pair is graded
              </p>
              <h2 id={titleId} className="text-30 font-black tracking-tight-3">
                {label}
              </h2>
            </div>
            <form method="dialog">
              <button
                type="submit"
                className="flex h-11 items-center rounded-md border-2 border-foreground px-4 text-16 font-bold uppercase hover:bg-foreground hover:text-background"
              >
                Close
              </button>
            </form>
          </div>
          <ConditionGradeList grade={grade} />
          <Link
            href="/condition-guide"
            className="text-16 font-bold underline underline-offset-4 hover:text-subtle-foreground"
          >
            See the full condition guide
          </Link>
        </div>
      </dialog>
    </>
  )
}
