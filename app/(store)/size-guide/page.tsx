import type { Metadata } from "next"

import { LightBulbIcon, WhatsappIcon } from "@/components/icons"
import { Container } from "@/components/shared/container"
import { PageBand } from "@/components/shared/page-band"
import { sizeGuides } from "@/content/size-guide"
import { SizeGuideTabs } from "@/features/content/components/size-guide-tabs"
import { siteConfig } from "@/lib/site"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Size guide",
  description: "Separate Brand New and Pre-Loved size charts for men and women: EU, UK, US and centimetres, plus how to measure your foot at home.",
  alternates: { canonical: "/size-guide" },
}

const steps = ["Place your foot flat on a piece of paper.", "Trace or mark heel to longest toe.", "Measure the distance in cm.", "Compare with the chart above."]

/** Optical offsets of the step numbers, measured from the design (the "1" in 01 is narrower). */
const numberOffset = ["md:ps-2.5", "md:ps-1.5", "md:ps-1.5", "md:ps-0.75"]

/** Size Guide (screen 08; tabs per D-058): Brand New / Pre-Loved charts, measuring steps and the "between two sizes" help strip. */
export default function SizeGuidePage() {
  return (
    <div className="bg-surface-sunken">
      <PageBand display description="EU · UK · US · CM size conversion.">
        Size guide
      </PageBand>

      <Container className="flex flex-col items-center pt-10 pb-16 md:pt-16.25 md:pb-18.25">
        <div className="flex w-full flex-col 3xl:w-320">
          <SizeGuideTabs guides={sizeGuides} />

          <section aria-labelledby="measure-title" className="pt-8 md:pt-12">
            <div className="flex flex-col gap-6 rounded-panel bg-foreground p-6 text-background md:gap-7.75 md:p-10">
              <h2 id="measure-title" className="text-24 font-extrabold uppercase md:text-32">
                How to measure your foot
              </h2>
              <ol className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4 xl:gap-3.25 3xl:flex">
                {steps.map((step, index) => (
                  <li key={step} className={cn("flex flex-col gap-1.5 3xl:h-32.5 3xl:w-72.5", index === 3 && "3xl:ps-0.25")}>
                    <span aria-hidden="true" className={cn("pt-1.5 font-display text-40 leading-12 font-bold text-brand md:text-48 md:leading-14.75", numberOffset[index])}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="max-w-62.5 text-18 font-semibold text-surface-sunken md:ps-2.5 md:text-20 md:leading-6">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>

        <aside aria-label="Sizing help" className="flex w-full pt-10 md:pt-19.5 3xl:w-367.5">
          <div className="flex w-full flex-col gap-6 rounded-callout bg-brand-tint p-6 3xl:h-47.5 3xl:flex-row 3xl:items-center 3xl:gap-0 3xl:p-0 3xl:ps-10.5 3xl:pe-10.75">
            <div className="flex items-center gap-5 3xl:gap-9.5">
              <span className="flex size-20 shrink-0 items-center justify-center rounded-full bg-brand 3xl:size-31.75">
                <LightBulbIcon aria-hidden="true" className="size-13 3xl:size-21" />
              </span>
              <p className="flex flex-col gap-1 3xl:w-128">
                <span className="text-22 font-extrabold uppercase 3xl:text-callout-title">Between two sizes?</span>
                <span className="text-18 font-medium text-subtle-foreground 3xl:text-callout-body 3xl:whitespace-nowrap">For a roomier fit, choose the larger size</span>
              </p>
            </div>
            <span aria-hidden="true" className="hidden shrink-0 3xl:block 3xl:ps-10">
              <span className="block h-26.5 w-0.5 bg-subtle-foreground" />
            </span>
            <div className="flex flex-wrap items-center gap-5 3xl:flex-nowrap 3xl:gap-0 3xl:ps-10.25">
              <WhatsappIcon aria-hidden="true" className="size-14 shrink-0 text-foreground 3xl:size-17" />
              <p className="flex flex-col gap-1 3xl:w-68.75 3xl:gap-1.25 3xl:ps-6.75">
                <span className="text-20 font-extrabold uppercase 3xl:text-callout-label">Still not sure?</span>
                <span className="text-16 font-medium text-subtle-foreground 3xl:text-callout-small">Our team is here to help.</span>
              </p>
              <div className="3xl:ps-12.5">
                <a
                  href={siteConfig.contact.whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-14 items-center rounded-lg bg-foreground px-6 font-display text-18 font-bold text-brand uppercase transition-colors hover:bg-brand hover:text-brand-foreground 3xl:h-21 3xl:w-58 3xl:justify-center 3xl:px-0 3xl:text-callout-label"
                >
                  Chat with us<span className="sr-only"> on WhatsApp (opens in a new tab)</span>
                </a>
              </div>
            </div>
          </div>
        </aside>
      </Container>
    </div>
  )
}
