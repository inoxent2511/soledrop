import "@/lib/validation"
import * as z from "zod/mini"

/** Shared normalization and limits, with the same checks on browser and server. */
export const emailSchema = z.pipe(z.pipe(z.string().check(z.trim(), z.toLowerCase()), z.email("Enter a valid email address")), z.string().check(z.maxLength(254)))
