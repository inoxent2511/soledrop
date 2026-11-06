import "@/lib/validation"
import { z } from "zod"

/** Pakistani provinces and territories, as used by couriers. */
export const PROVINCES = ["Sindh", "Punjab", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory", "Gilgit-Baltistan", "Azad Kashmir"] as const

/** Mobile numbers: 03XXXXXXXXX or +923XXXXXXXXX; spaces and dashes are ignored. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .refine((value) => /^(\+92|0)3\d{9}$/.test(value), "Enter a mobile number like 0300 1234567")

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).pipe(z.string().max(254))

export const addressSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(80),
  phone: phoneSchema,
  line1: z.string().trim().min(5, "Enter your house and street").max(120),
  line2: z.string().trim().max(120).optional().or(z.literal("").transform(() => undefined)),
  city: z.string().trim().min(2, "Enter your city").max(60),
  province: z.enum(PROVINCES, "Choose your province"),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Postal codes have 5 digits")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  country: z.literal("PK").default("PK"),
})

export type AddressInput = z.infer<typeof addressSchema>

export const checkoutSchema = z.object({
  email: emailSchema,
  address: addressSchema,
  shippingCode: z.string().min(1, "Choose a delivery option"),
  paymentMethod: z.string().min(1, "Choose how you'd like to pay"),
  note: z.string().trim().max(500).optional(),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  saveAddress: z.boolean().optional(),
})

export type CheckoutInput = z.infer<typeof checkoutSchema>

/** Delivery quote request: just enough address to pick a zone and tax rate. */
export const quoteSchema = z.object({
  city: z.string().trim().max(60).optional(),
  province: z.enum(PROVINCES).optional(),
  shippingCode: z.string().optional(),
})

export const orderLookupSchema = z.object({
  number: z.string().trim().toUpperCase().regex(/^SD\d{5,}$/, "Order numbers look like SD10001"),
  email: emailSchema,
})

export const returnRequestSchema = z.object({
  lines: z.array(z.object({ orderLineId: z.uuid(), quantity: z.number().int().positive() })).min(1, "Choose at least one item"),
  reason: z.string().trim().min(5, "Tell us briefly what's wrong").max(500),
})
