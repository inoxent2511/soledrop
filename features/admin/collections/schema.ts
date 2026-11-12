import "@/lib/validation"
import { z } from "zod"

import { SLUG } from "@/features/admin/products/schema"

/** One rule of a rule-based collection (server/rules evaluates them; every rule must match). */
export const collectionRule = z.discriminatedUnion("field", [
  z.object({ field: z.literal("kind"), equals: z.enum(["new", "preloved"]) }),
  z.object({ field: z.literal("gender"), in: z.array(z.enum(["men", "women", "kids", "unisex"])).min(1) }),
  z.object({ field: z.literal("tag"), equals: z.string().trim().min(1).max(40) }),
  z.object({ field: z.literal("onSale"), equals: z.boolean() }),
  z.object({ field: z.literal("publishedWithinDays"), days: z.number().int().min(1).max(365) }),
])

export const collectionInput = z.object({
  slug: z.string().trim().min(2).max(120).regex(SLUG, "Lowercase letters, numbers and dashes"),
  title: z.string().trim().min(2, "Add a title").max(80),
  headline: z.tuple([z.string().trim().max(40), z.string().trim().max(40)]),
  description: z.string().trim().max(1000).default(""),
  kind: z.enum(["manual", "rule"]),
  rules: z.array(collectionRule).max(10).default([]),
  seo: z.object({ title: z.string().trim().max(70).optional(), description: z.string().trim().max(160).optional() }).default({}),
  productIds: z.array(z.uuid()).max(2000).nullable().default(null),
  image: z.object({ url: z.string().regex(/^\/(?:media\/|images\/)[^\s\\]+$/, "Choose an uploaded image"), alt: z.string().trim().max(300), width: z.number().int().positive(), height: z.number().int().positive(), mode: z.literal("full").optional() }).refine((value) => value.mode !== "full" || Boolean(value.alt), "Describe the complete banner for screen readers").nullable().optional(),
})

export type CollectionInput = z.infer<typeof collectionInput>
