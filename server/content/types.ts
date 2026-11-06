/**
 * Page content is a list of typed blocks rendered by the block registry
 * (features/content/components/block-registry.tsx). New block types are added there and here.
 */
export type ContentBlock =
  | { type: "heading"; text: string; level: 2 | 3 }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "callout"; title: string; text: string }
  | { type: "faq"; category: string }
  | { type: "cta"; label: string; href: string; text: string }

export type Page = {
  slug: string
  title: string
  description: string
  blocks: ContentBlock[]
  updatedAt: string
  seo: { title?: string; description?: string; noindex?: boolean }
  /** Hidden from the storefront when false (admin drafts); seed pages are published. */
  published?: boolean
}

export type Faq = { id: string; category: string; question: string; answer: string; position: number }

export type NewsletterSubscriber = {
  email: string
  status: "subscribed" | "unsubscribed"
  source: string
  consentAt: string
}

export type ContactMessage = {
  id: string
  name: string
  email: string
  orderNumber: string | null
  message: string
  createdAt: string
}
