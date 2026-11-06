import "@/lib/validation"
import { z } from "zod"

export const addLineSchema = z.object({
  variantId: z.uuid("Choose a size"),
  quantity: z.number().int().min(1).max(10).default(1),
})

export const updateLineSchema = z.object({ quantity: z.number().int().min(0).max(10) })

export const promoCodeSchema = z.object({
  code: z.string().trim().min(2, "Enter a code").max(32).toUpperCase(),
})
