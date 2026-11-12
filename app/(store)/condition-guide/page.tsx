import type { Metadata } from "next"
import Link from "next/link"

import { CheckIcon } from "@/components/icons"
import { Container } from "@/components/shared/container"
import { PageBand } from "@/components/shared/page-band"
import { buttonVariants } from "@/components/ui/button-variants"
import { gradingSteps, listingPromises } from "@/content/condition-guide"
import {
  CONDITION_GUIDE_NOTE,
  CONDITION_GUIDE_TITLE,
} from "@/features/catalog/lib/condition-grades"
import { ConditionGradesGuide } from "@/features/content/components/condition-grades-guide"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Condition guide",
  description:
    "What Premium, Excellent, Very Good and Minor Issue mean for a pre-loved pair, part by part, and how every pair is graded.",
  alternates: { canonical: "/condition-guide" },
}

/**
 * Condition Guide (D-046; layout D-073): the four pre-loved grades as one vertical, side-swapping story,
 * how a pair is graded, and what every listing promises. Laid out like the Size Guide (screen 08).
 */
export default function ConditionGuidePage() {
  return (
    <div className="bg-surface-sunken">
      <PageBand
        display
        description="Four grades. Every pre-loved pair inspected by hand."
      >
        Condition guide
      </PageBand>

      <Container className="flex flex-col items-center pt-10 pb-16 md:pt-16.25 md:pb-18.25">
        <div className="flex w-full flex-col gap-8 md:gap-12 3xl:w-320">
          <section
            aria-labelledby="grades-title"
            className="flex flex-col gap-5 md:gap-6"
          >
            <div className="flex flex-col gap-2">
              <h2
                id="grades-title"
                className="text-24 font-extrabold uppercase md:text-32"
              >
                {CONDITION_GUIDE_TITLE}
              </h2>
              <p className="max-w-200 text-16 font-medium text-subtle-foreground md:text-18">
                {CONDITION_GUIDE_NOTE}
              </p>
            </div>
            <ConditionGradesGuide />
          </section>

          <section aria-labelledby="grading-title">
            <div className="flex flex-col gap-6 rounded-panel bg-foreground p-6 text-background md:gap-7.75 md:p-10">
              <h2
                id="grading-title"
                className="text-24 font-extrabold uppercase md:text-32"
              >
                How we grade a pair
              </h2>
              <ol className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                {gradingSteps.map((step, index) => (
                  <li key={step.title} className="flex flex-col gap-1.5">
                    <span
                      aria-hidden="true"
                      className="font-display text-40 leading-12 font-bold text-brand md:text-48 md:leading-14.75"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-20 font-extrabold uppercase">
                      {step.title}
                    </span>
                    <span className="max-w-62.5 text-18 font-medium text-muted-foreground">
                      {step.text}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <aside
            aria-labelledby="promise-title"
            className="flex flex-col gap-6 rounded-callout bg-brand-tint p-6 md:p-10 xl:flex-row xl:items-center xl:justify-between"
          >
            <div className="flex flex-col gap-4">
              <h2
                id="promise-title"
                className="text-22 font-extrabold uppercase md:text-28"
              >
                Every pre-loved listing shows
              </h2>
              <ul className="flex flex-col gap-3 md:flex-row md:flex-wrap md:gap-x-8">
                {listingPromises.map((promise) => (
                  <li
                    key={promise}
                    className="flex items-center gap-3 text-18 font-semibold"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-brand">
                      <CheckIcon aria-hidden="true" className="size-3.5" />
                    </span>
                    {promise}
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href="/pre-loved"
              className={cn(
                buttonVariants({ tone: "ink", size: "md" }),
                "w-fit shrink-0 px-8"
              )}
            >
              Shop pre-loved
            </Link>
          </aside>
        </div>
      </Container>
    </div>
  )
}
