import Link from "next/link"
import { Fragment, type ReactNode } from "react"

import { siteConfig } from "@/lib/site"

/** Values the FAQ answers refer to as `{name}` (D-066); filled at render time so they never drift. */
export type FaqValues = { standardShipping: string | null }

const TOKEN = /\{(supportEmail|contactNumber|contactPage|standardShipping)\}/g

const linkClass =
  "font-semibold text-foreground underline underline-offset-4 wrap-anywhere hover:text-subtle-foreground"

function tokenText(name: string, values: FaqValues): string {
  switch (name) {
    case "supportEmail":
      return siteConfig.contact.email
    case "contactNumber":
      return siteConfig.contact.whatsappLabel
    case "contactPage":
      return `${new URL(siteConfig.url).host}/contact`
    default:
      return values.standardShipping ?? "shown at checkout"
  }
}

function tokenNode(name: string, values: FaqValues): ReactNode {
  switch (name) {
    case "supportEmail":
      return (
        <a href={`mailto:${siteConfig.contact.email}`} className={linkClass}>
          {siteConfig.contact.email}
        </a>
      )
    case "contactNumber":
      return (
        <a
          href={siteConfig.contact.whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          <bdi dir="ltr">{siteConfig.contact.whatsappLabel}</bdi>
          <span className="sr-only"> (WhatsApp, opens in a new tab)</span>
        </a>
      )
    case "contactPage":
      return (
        <Link href="/contact" className={linkClass}>
          {tokenText(name, values)}
        </Link>
      )
    default:
      return (
        <strong className="font-semibold text-foreground">
          {tokenText(name, values)}
        </strong>
      )
  }
}

/** An FAQ answer with its `{tokens}` as links (email, WhatsApp, contact form) or the live delivery rate. */
export function FaqAnswer({
  answer,
  values,
}: {
  answer: string
  values: FaqValues
}) {
  const parts = answer.split(TOKEN)
  // split() with a capture group alternates text, token name, text…
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index % 2 === 1 ? tokenNode(part, values) : part}
    </Fragment>
  ))
}

/** The same answer as plain text, for the FAQPage structured data. */
export function faqAnswerText(answer: string, values: FaqValues): string {
  return answer.replace(TOKEN, (_, name: string) => tokenText(name, values))
}
