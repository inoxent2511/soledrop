import "@/lib/validation"
import { z } from "zod"

import { addressSchema, emailSchema, phoneSchema } from "@/features/checkout/schemas/checkout"

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Use 128 characters or fewer")
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), "Use letters and at least one number")

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(80),
  email: emailSchema,
  password: passwordSchema,
  marketingOptIn: z.boolean().default(false),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128),
})

export const forgotPasswordSchema = z.object({ email: emailSchema })

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
})

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(80),
  phone: phoneSchema.nullable().or(z.literal("").transform(() => null)),
  marketingOptIn: z.boolean(),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: passwordSchema,
})

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm"),
  confirm: z.literal("DELETE", "Type DELETE to confirm"),
})

export const savedAddressSchema = addressSchema.extend({ isDefault: z.boolean().default(false) })
