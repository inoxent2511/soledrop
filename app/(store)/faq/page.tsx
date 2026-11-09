import type { Metadata } from "next"
import Link from "next/link"

import {
  ArrowRightIcon,
  ChevronDownIcon,
  EmailIcon,
  WhatsappIcon,
} from "@/components/icons"
import { Container } from "@/components/shared/container"
import { JsonLd } from "@/components/shared/json-ld"
import { PageBand } from "@/components/shared/page-band"
import { buttonVariants } from "@/components/ui/button-variants"
import {
  FaqAnswer,
  faqAnswerText,
  type FaqValues,
} from "@/features/content/components/faq-answer"
import { siteConfig } from "@/lib/site"
import { cn } from "@/lib/utils"
import { deliveryRates, faqPageData } from "@/server/storefront"

/** The delivery answer shows the live rate; refreshed every five minutes (docs/app/caching.md). */
export const revalidate = 300

export const metadata: Metadata = {
  title: "FAQs",
  description:
    "Answers on buying Brand New and Pre-Loved shoes at Soledrop: condition grades, sizing, delivery, payment, returns, exchanges and refunds.",
  alternates: { canonical: "/faq" },
}

/** Where each topic is explained in full. */
const MORE: Record<string, { label: string; href: string }> = {
  "Shopping & sizing": { label: "Size Guide", href: "/size-guide" },
  "Pre-Loved shoes": { label: "Condition Guide", href: "/condition-guide" },
  "Delivery & tracking": {
    label: "Shipping & Delivery Policy",
    href: "/shipping",
  },
  "Returns, exchanges & refunds": {
    label: "Returns, Exchanges & Refunds Policy",
    href: "/returns",
  },
  "Contact us": { label: "Contact page", href: "/contact" },
}

const number = (index: number) => String(index + 1).padStart(2, "0")

/**
 * FAQs (screen 07; content D-066). The design gives the band and an empty body (D-025): the body
 * is a sticky topic index beside numbered topic cards, one native disclosure per question (works
 * without JavaScript), each topic ending with the page that covers it in full.
 */
export default async function FaqPage() {
  const [groups, { standardShipping }] = await Promise.all([
    faqPageData(),
    deliveryRates(),
  ])
  const values: FaqValues = { standardShipping }
  const structured = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((group) =>
      group.items.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faqAnswerText(faq.answer, values),
        },
      }))
    ),
  }
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)

  return (
    <div className="bg-surface">
      <JsonLd data={structured} />
      <PageBand display description="Soledrop | Buying New & Pre-Loved Shoes">
        FAQs
      </PageBand>
      <Container className="grid items-start gap-6 pt-8 pb-16 md:pt-12 lg:grid-cols-[18rem_1fr] lg:gap-16 lg:pt-16 lg:pb-24 3xl:px-50">
        <div className="flex flex-col gap-6 lg:sticky lg:top-27.5">
          <nav aria-label="FAQ topics" className="flex flex-col gap-3">
            <p className="text-14 font-bold tracking-wide-2 text-faint-foreground uppercase lg:px-3">
              {total} questions · {groups.length} topics
            </p>
            <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
              {groups.map((group, index) => (
                <li key={group.anchor}>
                  <a
                    href={`#${group.anchor}`}
                    className="group flex min-h-11 items-center gap-3 rounded-full border border-border bg-background px-4 text-16 font-semibold transition-colors hover:border-foreground lg:rounded-md lg:border-0 lg:bg-transparent lg:px-3 lg:text-17 lg:hover:bg-background"
                  >
                    <span
                      aria-hidden="true"
                      className="hidden w-6 font-display text-14 font-bold text-faint-foreground tabular-nums group-hover:text-foreground lg:inline"
                    >
                      {number(index)}
                    </span>
                    <span className="min-w-0 flex-1">{group.category}</span>
                    <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-14 font-bold text-subtle-foreground">
                      {group.items.length}
                      <span className="sr-only"> questions</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="hidden flex-col gap-3 rounded-xl bg-foreground p-5 text-background lg:flex">
            <p className="text-18 font-extrabold uppercase">
              Can&apos;t find it?
            </p>
            <p className="text-16 text-muted-foreground">
              Ask us about sizing, condition or your order.
            </p>
            <Link
              href="/contact"
              className={cn(
                buttonVariants({ tone: "brand", size: "card" }),
                "w-full"
              )}
            >
              Contact us
            </Link>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6 md:gap-8">
          {groups.map((group, index) => {
            const more = MORE[group.category]
            return (
              <section
                key={group.anchor}
                id={group.anchor}
                aria-labelledby={`${group.anchor}-title`}
                className="flex flex-col gap-2 rounded-xl bg-background p-6 md:p-10"
              >
                <div className="flex items-center gap-3 md:gap-4">
                  <span
                    aria-hidden="true"
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground font-display text-16 font-bold text-brand md:size-13 md:text-18"
                  >
                    {number(index)}
                  </span>
                  <h2
                    id={`${group.anchor}-title`}
                    className="min-w-0 text-20 leading-tight font-extrabold wrap-break-word uppercase sm:text-22 md:text-28"
                  >
                    {group.category}
                  </h2>
                </div>
                <div className="flex flex-col pt-2">
                  {group.items.map((faq) => (
                    <details
                      key={faq.id}
                      className="group border-b border-border last:border-b-0"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 md:py-6 [&::-webkit-details-marker]:hidden">
                        <h3 className="text-18 font-semibold transition-colors group-open:font-bold md:text-20">
                          {faq.question}
                        </h3>
                        <span
                          aria-hidden="true"
                          className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-foreground transition-colors group-open:border-brand group-open:bg-brand group-hover:bg-brand-tint group-open:group-hover:bg-brand"
                        >
                          <ChevronDownIcon className="h-auto w-3.5 transition-transform duration-200 group-open:rotate-180" />
                        </span>
                      </summary>
                      <p className="max-w-prose border-s-4 border-brand ps-4 pb-6 text-16 leading-relaxed text-subtle-foreground md:text-18">
                        <FaqAnswer answer={faq.answer} values={values} />
                      </p>
                    </details>
                  ))}
                </div>
                {more ? (
                  <Link
                    href={more.href}
                    className="group flex w-fit items-center gap-2 pt-4 text-16 font-bold underline-offset-4 hover:underline"
                  >
                    {more.label}
                    <ArrowRightIcon
                      aria-hidden="true"
                      className="h-auto w-3.5 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
                    />
                  </Link>
                ) : null}
              </section>
            )
          })}

          <section
            aria-labelledby="faq-help-title"
            className="flex flex-col gap-6 rounded-panel bg-foreground p-6 text-background md:p-10 xl:flex-row xl:items-center xl:justify-between"
          >
            <div className="flex flex-col gap-1">
              <h2
                id="faq-help-title"
                className="text-22 font-extrabold uppercase md:text-28"
              >
                Still have a question?
              </h2>
              <p className="text-16 text-muted-foreground md:text-18">
                Message us or chat on WhatsApp. Include your order number for
                faster help.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/contact"
                className={cn(
                  buttonVariants({ tone: "brand", size: "md" }),
                  "gap-2 px-6"
                )}
              >
                <EmailIcon aria-hidden="true" className="size-5" />
                Contact us
              </Link>
              <a
                href={siteConfig.contact.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ tone: "outline-dark", size: "md" }),
                  "gap-2 px-6"
                )}
              >
                <WhatsappIcon aria-hidden="true" className="size-5" />
                WhatsApp<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </section>
        </div>
      </Container>
    </div>
  )
}
