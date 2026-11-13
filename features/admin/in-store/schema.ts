import "@/lib/validation"
import { z } from "zod"

export const saleInput = z.object({
  items: z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(20) })).min(1).max(20),
  discountMinor: z.number().int().nonnegative().safe().default(0),
  customerName: z.string().trim().max(190).default(""),
  customerEmail: z.union([z.email().max(254), z.literal("")]).default(""),
  customerPhone: z.string().trim().max(40).default(""),
  shopAddress: z.string().trim().min(5, "Enter the shop address for the receipt.").max(300),
  province: z.string().trim().max(80).default(""),
  paymentMethod: z.enum(["cash", "bank_transfer"]),
  paymentReference: z.string().trim().max(190).default(""),
  tenderedMinor: z.number().int().nonnegative().safe().default(0),
  idempotencyKey: z.uuid(),
  expectedTotalMinor: z.number().int().nonnegative().safe().optional(),
  expectedQuote: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  policyShown: z.literal(true),
}).superRefine((value, ctx) => {
  if (new Set(value.items.map((item) => item.variantId)).size !== value.items.length) ctx.addIssue({ code: "custom", path: ["items"], message: "Add each size only once." })
  if (value.paymentMethod === "bank_transfer" && !value.paymentReference) ctx.addIssue({ code: "custom", path: ["paymentReference"], message: "Enter the confirmed bank transfer reference." })
})

export type SaleInput = z.infer<typeof saleInput>
