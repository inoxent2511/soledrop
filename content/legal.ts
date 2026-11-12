/**
 * Shared shape of the owner's legal pages (Terms & Conditions D-054, Privacy Policy D-055): the
 * text is stored word for word, and bracketed fields in the owner's documents are `{ field }` tokens.
 */

/** Business details shared by every legal page. Unknown addresses still show as marked gaps. */
export const legalPublicationDate = "2026-11-11"

export const legalOwnerDetails = {
  legalName: "SOLEDROP" as string | null,
  registeredAddress: null as string | null,
  postalAddress: null as string | null,
}

/** The bracketed fields in the owner's documents. */
export type LegalField =
  | "effectiveDate"
  | "legalName"
  | "registeredAddress"
  | "postalAddress"
  | "website"
  | "supportEmail"
  | "privacyEmail"
  | "contactNumber"
  /** Filled by the page from the store's live delivery rates, so it always matches checkout. */
  | "standardShipping"

/** The owner's bracketed labels, shown as-is while a detail is still missing. */
export const legalPlaceholders: Record<LegalField, string> = {
  effectiveDate: "11/11/2026",
  legalName: "SOLEDROP",
  registeredAddress: "[REGISTERED BUSINESS ADDRESS]",
  postalAddress: "[BUSINESS POSTAL ADDRESS]",
  website: "[WEBSITE ADDRESS]",
  supportEmail: "[SUPPORT EMAIL]",
  privacyEmail: "[PRIVACY OR SUPPORT EMAIL]",
  contactNumber: "[CONTACT NUMBER]",
  standardShipping: "[INSERT PKR AMOUNT OR RATE RULE]",
}

/** A run of text inside a paragraph. `grades` is the store's list of pre-loved condition grades. */
export type LegalInline =
  | string
  | { strong: string }
  | { text: string; href: string }
  | { field: LegalField }
  | { grades: true }

export type LegalParagraph = LegalInline[]

export type LegalSection = {
  /** Anchor id, also used by the section menu. */
  id: string
  title: string
  /** Short label for the section menu. */
  short: string
  paragraphs: LegalParagraph[]
  /** Cards that open the section, two per row from md. `brand` is lime-tinted, `plain` is grey. */
  cards?: {
    title: string
    tone: "brand" | "plain"
    paragraph: LegalParagraph
  }[]
  /** A numbered timeline drawn before the section's text (e.g. order → dispatch → delivery). */
  steps?: { title: string; detail?: string }[]
  /** A comparison table: the first column of each row is its heading; `head[0]` labels that column. */
  table?: { head: string[]; rows: string[][] }
}

export type LegalDocument = {
  title: string
  subtitle: string
  /** The effective date as an ISO date (YYYY-MM-DD). */
  effectiveDate: string | null
  /** What the document is called in running text ("these terms", "this policy"). */
  noun: string
  intro: LegalParagraph
  /** The "at a glance" panel: pointers into the full text, never a replacement for it. */
  highlights: { title: string; text: string; section: string }[]
  sections: LegalSection[]
  /** The closing section, rendered as the dark contact card. */
  contact: {
    id: string
    title: string
    short: string
    paragraphs: LegalParagraph[]
    /** A second button beside "Send us a message". */
    action?: { label: string; href: string }
  }
}

/** Shared links into the store's other pages. */
export const legalLinks = {
  shipping: { text: "Shipping & Delivery Policy", href: "/shipping" },
  returns: { text: "Returns & Refunds Policy", href: "/returns" },
  privacy: { text: "Privacy Policy", href: "/privacy" },
  conditionGuide: { text: "Condition Guide", href: "/condition-guide" },
}
