import "@/lib/validation"
import { z } from "zod"

import { emailSchema } from "@/features/checkout/schemas/checkout"

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: emailSchema,
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^SD\d{5,}$/, "Order numbers look like SD10001")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  message: z.string().trim().min(10, "Tell us a little more (10 characters or more)").max(2000),
  /** Honeypot: humans never see or fill it. */
  website: z.string().max(0).optional(),
})

export const newsletterSchema = z.object({
  email: emailSchema,
  source: z.string().max(40).default("footer"),
  website: z.string().max(0).optional(),
})
