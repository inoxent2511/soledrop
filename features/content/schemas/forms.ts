import "@/lib/validation"
import * as z from "zod/mini"

import { emailSchema } from "@/features/checkout/schemas/email"

export const contactSchema = z.object({
  name: z.string().check(z.trim(), z.minLength(2, "Enter your name"), z.maxLength(80)),
  email: emailSchema,
  orderNumber: z.union([z.optional(z.string().check(z.trim(), z.toUpperCase(), z.regex(/^SD\d{5,}$/, "Order numbers look like SD10001"))), z.pipe(z.literal(""), z.transform(() => undefined))]),
  message: z.string().check(z.trim(), z.minLength(10, "Tell us a little more (10 characters or more)"), z.maxLength(2000)),
  /** Honeypot: humans never see or fill it. */
  website: z.optional(z.string().check(z.maxLength(0))),
})

export const newsletterSchema = z.object({
  email: emailSchema,
  source: z._default(z.string().check(z.maxLength(40)), "footer"),
  website: z.optional(z.string().check(z.maxLength(0))),
})
