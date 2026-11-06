import "@/lib/validation"
import { z } from "zod"

import { SLUG } from "@/features/admin/products/schema"

/** Content blocks (server/content/types.ts) as the block editor sends them. Links must stay on the site. */
export const contentBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().trim().min(1).max(160), level: z.union([z.literal(2), z.literal(3)]) }),
  z.object({ type: z.literal("paragraph"), text: z.string().trim().min(1).max(5000) }),
  z.object({ type: z.literal("list"), items: z.array(z.string().trim().min(1).max(500)).min(1).max(50), ordered: z.boolean().optional() }),
  z.object({ type: z.literal("callout"), title: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(1000) }),
  z.object({ type: z.literal("faq"), category: z.string().trim().min(1).max(60) }),
  z.object({ type: z.literal("cta"), label: z.string().trim().min(1).max(40), href: z.string().trim().regex(/^\/(?!\/)[^\s]*$/, "Links go to a page on this site, starting with /"), text: z.string().trim().max(300) }),
])

export const pageInput = z.object({
  slug: z.string().trim().min(2).max(80).regex(SLUG, "Lowercase letters, numbers and dashes"),
  title: z.string().trim().min(2, "Add a title").max(120),
  description: z.string().trim().max(300).default(""),
  blocks: z.array(contentBlock).max(100),
  seo: z.object({ title: z.string().trim().max(70).optional(), description: z.string().trim().max(160).optional(), noindex: z.boolean().optional() }).default({}),
})

export const faqInput = z.object({
  category: z.string().trim().min(2).max(60),
  question: z.string().trim().min(5, "Write the question").max(300),
  answer: z.string().trim().min(2, "Write the answer").max(3000),
})

export type PageInput = z.infer<typeof pageInput>
export type FaqInput = z.infer<typeof faqInput>
