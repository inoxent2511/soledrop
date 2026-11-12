import Link from "next/link"
import type { ReactNode } from "react"

import {
  ArrowRightIcon,
  ChevronDownIcon,
  EmailIcon,
  WhatsappIcon,
} from "@/components/icons"
import { buttonVariants } from "@/components/ui/button-variants"
import { gradeDetails } from "@/content/condition-guide"
import {
  legalOwnerDetails,
  legalPlaceholders,
  type LegalDocument,
  type LegalField,
  type LegalInline,
  type LegalParagraph,
  type LegalSection,
} from "@/content/legal"
import { conditionLabel } from "@/lib/format"
import { siteConfig } from "@/lib/site"
import { cn } from "@/lib/utils"

type Tone = "light" | "dark"

/** Field values the page resolves at render time (e.g. the live delivery rate); a missing one shows as a gap. */
export type PolicyValues = Partial<Record<LegalField, string>>

/** What every piece of a policy page needs to render its text. */
type Context = { document: LegalDocument; values: PolicyValues }

const linkClass = (tone: Tone) =>
  cn(
    "font-semibold wrap-anywhere underline underline-offset-4 transition-colors",
    tone === "light"
      ? "text-foreground hover:text-subtle-foreground"
      : "text-background hover:text-brand"
  )

const number = (index: number) => String(index + 1).padStart(2, "0")

/** The store's current grades, so a legal page never drifts from the Condition Guide. */
const gradeList = (() => {
  const labels = gradeDetails.map((detail) => conditionLabel(detail.grade))
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`
})()

function Gap({ field }: { field: LegalField }) {
  return (
    <mark className="rounded-xs bg-brand-tint px-1 font-semibold wrap-anywhere text-foreground">
      {legalPlaceholders[field]}
    </mark>
  )
}

function FieldValue({
  field,
  context,
  tone,
}: {
  field: LegalField
  context: Context
  tone: Tone
}) {
  const { contact, url } = siteConfig
  const live = context.values[field]
  if (live) return <>{live}</>
  switch (field) {
    case "supportEmail":
    case "privacyEmail":
      return (
        <a href={`mailto:${contact.email}`} className={linkClass(tone)}>
          {contact.email}
        </a>
      )
    case "contactNumber":
      return (
        <a
          href={contact.whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass(tone)}
        >
          <bdi dir="ltr">{contact.whatsappLabel}</bdi>
          <span className="sr-only"> (WhatsApp, opens in a new tab)</span>
        </a>
      )
    case "website":
      return (
        <a href={url} className={linkClass(tone)}>
          {new URL(url).host}
        </a>
      )
    case "effectiveDate":
      return context.document.effectiveDate ? (
        <>{context.document.effectiveDate.split("-").reverse().join("/")}</>
      ) : (
        <Gap field={field} />
      )
    case "standardShipping":
      return <Gap field={field} />
    default:
      return legalOwnerDetails[field] ? (
        <>{legalOwnerDetails[field]}</>
      ) : (
        <Gap field={field} />
      )
  }
}

function Paragraph({
  runs,
  context,
  tone = "light",
  className,
}: {
  runs: LegalParagraph
  context: Context
  tone?: Tone
  className?: string
}) {
  const inline = (run: LegalInline, index: number) => {
    if (typeof run === "string") return run
    if ("strong" in run)
      return (
        <strong
          key={index}
          className={cn(
            "font-semibold",
            tone === "light" ? "text-foreground" : "text-background"
          )}
        >
          {run.strong}
        </strong>
      )
    if ("href" in run)
      return (
        <Link key={index} href={run.href} className={linkClass(tone)}>
          {run.text}
        </Link>
      )
    if ("field" in run)
      return (
        <FieldValue
          key={index}
          field={run.field}
          context={context}
          tone={tone}
        />
      )
    return gradeList
  }
  return (
    <p
      className={cn(
        "text-16 leading-relaxed md:text-18",
        tone === "light" ? "text-subtle-foreground" : "text-muted-foreground",
        className
      )}
    >
      {runs.map(inline)}
    </p>
  )
}

function SectionNumber({
  index,
  tone = "light",
}: {
  index: number
  tone?: Tone
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full font-display text-16 font-bold md:size-13 md:text-18",
        tone === "light"
          ? "bg-foreground text-brand"
          : "bg-brand text-brand-foreground"
      )}
    >
      {number(index)}
    </span>
  )
}

function SectionMenu({
  document,
  onPhone,
}: {
  document: LegalDocument
  onPhone: boolean
}) {
  const menu = [...document.sections, document.contact]
  const label = `${document.title} sections`
  const items = (
    <ol className={cn("flex flex-col", onPhone ? "gap-0.5 pt-3" : "gap-1")}>
      {menu.map((item, index) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            className="group flex min-h-11 items-center gap-3 rounded-md px-3 text-16 font-semibold transition-colors hover:bg-background lg:text-17"
          >
            <span
              aria-hidden="true"
              className="w-6 font-display text-14 font-bold text-faint-foreground tabular-nums group-hover:text-foreground"
            >
              {number(index)}
            </span>
            {item.short}
          </a>
        </li>
      ))}
    </ol>
  )

  if (onPhone) {
    return (
      <details className="group rounded-xl border border-border bg-background p-2 lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-3 text-16 font-bold [&::-webkit-details-marker]:hidden">
          Jump to a section
          <ChevronDownIcon className="h-auto w-4 shrink-0 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <nav aria-label={label}>{items}</nav>
      </details>
    )
  }

  return (
    <div className="hidden flex-col gap-6 lg:sticky lg:top-27.5 lg:flex">
      <nav aria-label={label} className="flex flex-col gap-3">
        <p className="px-3 text-14 font-bold tracking-wide-2 text-faint-foreground uppercase">
          On this page
        </p>
        {items}
      </nav>
      <div className="flex flex-col gap-3 rounded-xl bg-foreground p-5 text-background">
        <p className="text-18 font-extrabold uppercase">Questions?</p>
        <p className="text-16 text-muted-foreground">
          Our team will walk you through any part of {document.noun}.
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
  )
}

function Highlights({ document }: { document: LegalDocument }) {
  const position = (id: string) =>
    document.sections.findIndex((section) => section.id === id)
  return (
    <section
      aria-labelledby="glance-title"
      className="flex flex-col gap-6 rounded-panel bg-foreground p-6 text-background md:gap-8 md:p-10"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="glance-title"
          className="text-24 font-extrabold uppercase md:text-32"
        >
          At a glance
        </h2>
        <p className="text-16 text-muted-foreground md:text-18">
          The essentials. The full text below always applies.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {document.highlights.map((item) => (
          <li key={item.section}>
            <a
              href={`#${item.section}`}
              className="group flex h-full flex-col gap-2 rounded-xl border border-well-dark p-5 transition-colors hover:border-brand focus-visible:border-brand"
            >
              <span className="text-20 font-extrabold text-brand uppercase">
                {item.title}
              </span>
              <span className="text-16 text-muted-foreground">{item.text}</span>
              <span className="flex items-center gap-2 pt-1 text-14 font-bold uppercase">
                Read section {number(position(item.section))}
                <ArrowRightIcon className="h-auto w-3.5 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Column classes per step count, written out so Tailwind sees them. */
const STEP_COLUMNS: Record<number, string> = {
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
}

/** A numbered timeline (order → prepared → courier → delivered), one row from lg or xl. */
function Steps({ steps }: { steps: NonNullable<LegalSection["steps"]> }) {
  return (
    <ol
      className={cn(
        "grid gap-3",
        STEP_COLUMNS[steps.length] ?? "sm:grid-cols-2 lg:grid-cols-4"
      )}
    >
      {steps.map((step, index) => (
        <li
          key={step.title}
          className={cn(
            "flex flex-col gap-3 rounded-xl p-5",
            index === steps.length - 1
              ? "bg-brand-tint"
              : "border border-border bg-surface"
          )}
        >
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-full bg-foreground font-display text-14 font-bold text-brand"
          >
            {index + 1}
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-18 font-extrabold uppercase">
              {step.title}
            </span>
            {step.detail ? (
              <span className="text-16 font-semibold text-subtle-foreground">
                {step.detail}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * A comparison table (the returns policy's Brand New vs Pre-Loved), with a black header in the
 * brand's lime. From md it is a real table; below md each row becomes a card, so nothing scrolls sideways.
 */
function ComparisonTable({
  table,
}: {
  table: NonNullable<LegalSection["table"]>
}) {
  const columns = table.head.slice(1)
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-foreground md:block">
        <table className="w-full border-collapse text-start text-16">
          <thead className="bg-foreground text-brand">
            <tr>
              {table.head.map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-5 py-4 text-start text-16 font-extrabold uppercase"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map(([rowHeading, ...cells]) => (
              <tr
                key={rowHeading}
                className="border-t border-border even:bg-surface"
              >
                <th
                  scope="row"
                  className="w-1/4 px-5 py-4 text-start align-top font-bold"
                >
                  {rowHeading}
                </th>
                {cells.map((cell, index) => (
                  <td
                    key={index}
                    className="px-5 py-4 align-top text-subtle-foreground"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {table.rows.map(([rowHeading, ...cells]) => (
          <li
            key={rowHeading}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
          >
            <p className="text-16 font-extrabold uppercase">{rowHeading}</p>
            <dl className="flex flex-col gap-3">
              {cells.map((cell, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <dt
                    className={cn(
                      "w-fit rounded-full px-3 py-0.5 text-14 font-bold",
                      index === 0
                        ? "bg-brand text-brand-foreground"
                        : "border border-foreground bg-background"
                    )}
                  >
                    {columns[index]}
                  </dt>
                  <dd className="text-16 text-subtle-foreground">{cell}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}

function SectionHeading({
  id,
  index,
  title,
  tone = "light",
}: {
  id: string
  index: number
  title: string
  tone?: Tone
}) {
  return (
    <div className="flex items-center gap-3 md:gap-4">
      <SectionNumber index={index} tone={tone} />
      <h2
        id={`${id}-title`}
        className="min-w-0 text-20 leading-tight font-extrabold wrap-break-word uppercase sm:text-22 md:text-28"
      >
        <span className="sr-only">{index + 1}. </span>
        {title}
      </h2>
    </div>
  )
}

function SectionCard({
  section,
  index,
  context,
  extra,
}: {
  section: LegalSection
  index: number
  context: Context
  extra?: ReactNode
}) {
  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-title`}
      className="flex flex-col gap-5 rounded-xl bg-background p-6 md:gap-6 md:p-10"
    >
      <SectionHeading id={section.id} index={index} title={section.title} />
      {section.table ? <ComparisonTable table={section.table} /> : null}
      {section.steps ? <Steps steps={section.steps} /> : null}
      {section.cards ? (
        <div className="grid gap-4 md:grid-cols-2">
          {section.cards.map((card) => (
            <div
              key={card.title}
              className={cn(
                "flex flex-col gap-3 rounded-xl p-5 md:p-6",
                card.tone === "brand"
                  ? "bg-brand-tint"
                  : "border border-border bg-surface"
              )}
            >
              <h3
                className={cn(
                  "w-fit rounded-full px-4 py-1.5 text-14 font-extrabold uppercase md:text-16",
                  card.tone === "brand"
                    ? "bg-brand text-brand-foreground"
                    : "border border-foreground bg-background"
                )}
              >
                {card.title}
              </h3>
              <Paragraph runs={card.paragraph} context={context} />
            </div>
          ))}
        </div>
      ) : null}
      {section.paragraphs.map((runs, paragraphIndex) => (
        <Paragraph key={paragraphIndex} runs={runs} context={context} />
      ))}
      {extra}
    </section>
  )
}

function ContactCard({ context, index }: { context: Context; index: number }) {
  const { contact } = siteConfig
  const { id, title, paragraphs, action } = context.document.contact
  const row =
    "flex min-h-11 items-center gap-4 text-16 font-semibold md:text-18"
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-6 rounded-panel bg-foreground p-6 text-background md:gap-8 md:p-10"
    >
      <SectionHeading id={id} index={index} title={title} tone="dark" />
      {paragraphs.map((runs, paragraphIndex) => (
        <Paragraph
          key={paragraphIndex}
          runs={runs}
          context={context}
          tone="dark"
        />
      ))}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10">
        <div className="flex flex-col gap-1">
          <p className="text-20 font-extrabold"><FieldValue field="legalName" context={context} tone="dark" /></p>
          <p className="text-16 text-muted-foreground md:text-18">
            <FieldValue field="postalAddress" context={context} tone="dark" />
          </p>
          <p className="text-16 text-muted-foreground md:text-18">
            <FieldValue field="website" context={context} tone="dark" />
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          <li>
            <a
              href={`mailto:${contact.email}`}
              className={cn(row, "hover:text-brand")}
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-well-dark text-brand">
                <EmailIcon className="size-5" />
              </span>
              <span className="min-w-0 wrap-anywhere">{contact.email}</span>
            </a>
          </li>
          <li>
            <a
              href={contact.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(row, "hover:text-brand")}
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-well-dark text-brand">
                <WhatsappIcon className="size-5" />
              </span>
              <bdi dir="ltr">{contact.whatsappLabel}</bdi>
              <span className="sr-only"> (WhatsApp, opens in a new tab)</span>
            </a>
          </li>
        </ul>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href="/contact"
          className={cn(
            buttonVariants({ tone: "brand", size: "md" }),
            "w-full sm:w-fit sm:px-10"
          )}
        >
          Send us a message
        </Link>
        {action ? (
          <Link
            href={action.href}
            className={cn(
              buttonVariants({ tone: "ink-light", size: "md" }),
              "w-full sm:w-fit sm:px-10"
            )}
          >
            {action.label}
          </Link>
        ) : null}
      </div>
    </section>
  )
}

/**
 * One of the owner's legal pages (Terms & Conditions D-054, Privacy Policy D-055, Shipping &
 * Delivery D-056): a section menu (sticky on desktop, a disclosure on phones), an "at a glance"
 * panel that points into the full text, numbered section cards (with optional cards, a step
 * timeline and a page-supplied `extras` block) and a contact card to close.
 */
export function PolicyDocument({
  document,
  values = {},
  extras = {},
}: {
  document: LegalDocument
  values?: PolicyValues
  extras?: Record<string, ReactNode>
}) {
  const context: Context = { document, values }
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[18rem_1fr] lg:gap-16">
      <SectionMenu document={document} onPhone={false} />
      <div className="flex min-w-0 flex-col gap-6 md:gap-8">
        <div className="flex flex-col gap-5 rounded-xl bg-background p-6 md:p-10">
          <p className="w-fit rounded-full bg-surface px-4 py-2 text-14 font-bold uppercase md:text-16">
            Effective date:{" "}
            <FieldValue field="effectiveDate" context={context} tone="light" />
          </p>
          <Paragraph
            runs={document.intro}
            context={context}
            className="md:text-20"
          />
        </div>

        <SectionMenu document={document} onPhone />
        <Highlights document={document} />

        {document.sections.map((section, index) => (
          <SectionCard
            key={section.id}
            section={section}
            index={index}
            context={context}
            extra={extras[section.id]}
          />
        ))}

        <ContactCard context={context} index={document.sections.length} />

        <a
          href="#top"
          className="flex min-h-11 w-fit items-center gap-2 self-center text-16 font-bold underline-offset-4 hover:underline"
        >
          Back to top
          <ChevronDownIcon className="h-auto w-3.5 rotate-180" />
        </a>
      </div>
    </div>
  )
}

/**
 * A few sections of a policy at the product page's compact size, with a link to the full page
 * (the Delivery panel shows the shipping policy's charges and timing, D-056).
 */
export function PolicyExcerpt({
  document,
  sectionIds,
  href,
  values = {},
}: {
  document: LegalDocument
  sectionIds: string[]
  href: string
  values?: PolicyValues
}) {
  const context: Context = { document, values }
  const sections = document.sections.filter((section) =>
    sectionIds.includes(section.id)
  )
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-2">
          <h3 className="text-18 font-bold md:text-20">{section.title}</h3>
          {section.paragraphs.map((runs, index) => (
            <Paragraph
              key={index}
              runs={runs}
              context={context}
              className="md:text-17"
            />
          ))}
        </div>
      ))}
      <Link
        href={href}
        className="flex w-fit items-center gap-2 text-16 font-bold underline underline-offset-4 hover:text-subtle-foreground"
      >
        Read the full {document.title}
        <ArrowRightIcon className="h-auto w-3.5 rtl:rotate-180" />
      </Link>
    </div>
  )
}
