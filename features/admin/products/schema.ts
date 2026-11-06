import "@/lib/validation"
import { z } from "zod"

import { CONDITION_GRADES } from "@/server/catalog/types"

/** The product form's payload (admin A3), validated in the browser and again by the API. Prices are minor units. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const variantInput = z.object({
  id: z.uuid().optional(),
  sku: z.string().trim().min(2, "Add a SKU").max(40).regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, dots, dashes and underscores only"),
  size: z.object({
    eu: z.string().trim().min(1, "EU size").max(8),
    uk: z.string().trim().min(1, "UK size").max(8),
    us: z.string().trim().min(1, "US size").max(8),
    cm: z.string().trim().max(8).default(""),
  }),
  weightGrams: z.number().int().min(0).max(10_000).default(0),
  /** Base price in minor units; null leaves the current price as it is. */
  price: z.number().int().min(0).max(100_000_000_00).nullable(),
  compareAt: z.number().int().min(0).max(100_000_000_00).nullable(),
})

export const productInput = z
  .object({
    title: z.string().trim().min(2, "Add a title").max(120),
    slug: z.string().trim().min(2).max(120).regex(SLUG, "Lowercase letters, numbers and dashes (nike-air-max-90)"),
    brandId: z.string().min(1, "Choose a brand"),
    kind: z.enum(["new", "preloved"]),
    gender: z.enum(["men", "women", "kids", "unisex"]),
    description: z.string().trim().max(5000).default(""),
    condition: z.enum(CONDITION_GRADES).nullable(),
    conditionNotes: z.string().trim().max(500).nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    collections: z.array(z.string().regex(SLUG)).max(30).default([]),
    seo: z.object({ title: z.string().trim().max(70).optional(), description: z.string().trim().max(160).optional() }).default({}),
    images: z
      .array(
        z.object({
          url: z.string().startsWith("/", "Images come from the media library").max(300),
          alt: z.string().trim().max(300).default(""),
          width: z.number().int().positive(),
          height: z.number().int().positive(),
          role: z.enum(["card", "gallery"]).default("gallery"),
        }),
      )
      .max(12, "Up to 12 photos")
      .default([]),
    variants: z.array(variantInput).min(1, "Add at least one size").max(40),
  })
  .superRefine((value, context) => {
    if (value.kind === "preloved" && !value.condition) context.addIssue({ code: "custom", path: ["condition"], message: "Pre-loved pairs need a condition grade" })
    if (value.kind === "new" && value.condition) context.addIssue({ code: "custom", path: ["condition"], message: "Brand-new pairs have no condition grade" })
    const skus = value.variants.map((variant) => variant.sku.toLowerCase())
    if (new Set(skus).size !== skus.length) context.addIssue({ code: "custom", path: ["variants"], message: "Each size needs its own SKU" })
    for (const [index, variant] of value.variants.entries()) {
      if (variant.compareAt !== null && variant.price !== null && variant.compareAt <= variant.price) {
        context.addIssue({ code: "custom", path: ["variants", index, "compareAt"], message: "The was-price must be higher than the price" })
      }
    }
  })

export type ProductInput = z.infer<typeof productInput>

/** "Nike Air Max 90" → "nike-air-max-90". */
export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
