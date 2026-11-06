import "@/lib/validation"
import { z } from "zod"

import { SLUG } from "@/features/admin/products/schema"

/** The promotion form (admin A5). Money in minor units, percentages in basis points (10% = 1000). */
export const promotionCondition = z.discriminatedUnion("type", [
  z.object({ type: z.literal("subtotal_at_least"), amount: z.number().int().positive() }),
  z.object({ type: z.literal("min_quantity"), quantity: z.number().int().min(1).max(100) }),
  z.object({ type: z.literal("product_kind"), kind: z.enum(["new", "preloved"]) }),
  z.object({ type: z.literal("collection"), slugs: z.array(z.string().regex(SLUG)).min(1).max(20) }),
  z.object({ type: z.literal("customer_group"), groups: z.array(z.string().min(1).max(30)).min(1).max(5) }),
  z.object({ type: z.literal("first_order") }),
])

export const promotionAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("percent_off_order"), basisPoints: z.number().int().min(1).max(10_000) }),
  z.object({ type: z.literal("fixed_off_order"), amount: z.number().int().positive() }),
  z.object({ type: z.literal("percent_off_items"), basisPoints: z.number().int().min(1).max(10_000), kind: z.enum(["new", "preloved"]).optional(), collections: z.array(z.string().regex(SLUG)).max(20).optional() }),
  z.object({ type: z.literal("free_shipping") }),
])

export const promotionInput = z
  .object({
    title: z.string().trim().min(2, "Add a title").max(80),
    code: z
      .string()
      .trim()
      .max(32)
      .regex(/^[A-Za-z0-9_-]*$/, "Letters, numbers, dashes and underscores only")
      .transform((value) => (value ? value.toUpperCase() : null))
      .nullable(),
    conditions: z.array(promotionCondition).max(10).default([]),
    actions: z.array(promotionAction).min(1, "Add what the promotion gives").max(5),
    startsAt: z.iso.datetime({ offset: true }).nullable(),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    usageLimit: z.number().int().positive().max(1_000_000).nullable(),
    perCustomerLimit: z.number().int().positive().max(1000).nullable(),
    active: z.boolean().default(true),
    combinable: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) context.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start" })
  })

export type PromotionInput = z.infer<typeof promotionInput>

/** A test basket for the simulator: one or more lines, a customer group and order history. */
export const simulationInput = z.object({
  lines: z.array(z.object({ kind: z.enum(["new", "preloved"]), collections: z.array(z.string().regex(SLUG)).default([]), quantity: z.number().int().min(1).max(20), unitPrice: z.number().int().min(0) })).min(1).max(10),
  customerGroup: z.enum(["retail", "wholesale"]).nullable().default(null),
  previousOrders: z.number().int().min(0).max(1000).default(0),
  code: z.string().trim().max(32).optional(),
})

export type SimulationInput = z.infer<typeof simulationInput>
