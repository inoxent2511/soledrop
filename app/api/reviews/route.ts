import { z } from "zod"

import { submitReview } from "@/server/reviews"
import { clientKey, route } from "@/server/http/route"
import { enforceRateLimit } from "@/server/platform/guards"
import { DomainError } from "@/server/shared/errors"

const fields = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: z.email().max(254),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(20).max(3000),
  productId: z.union([z.uuid(), z.literal("")]).default(""),
  website: z.string().max(200).default(""),
})

export const POST = route(async (request) => {
  await enforceRateLimit("reviews", await clientKey())
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new DomainError("validation", "Please submit the review form.")
  const maximum = 16 * 1024 * 1024
  if (Number(request.headers.get("content-length") ?? 0) > maximum) throw new DomainError("validation", "Your images are too large. Choose up to three images, each under 5 MB.")
  const form = await request.formData()
  const text = (name: string) => { const value = form.get(name); return typeof value === "string" ? value : "" }
  const input = fields.safeParse({ displayName: text("displayName"), email: text("email"), rating: text("rating"), title: text("title"), body: text("body"), productId: text("productId"), website: text("website") })
  if (!input.success) throw new DomainError("validation", "Please check your name, email, rating and review text.")
  if (input.data.website) return Response.json({ ok: true }, { status: 202 })
  const images = form.getAll("images")
  if (images.length > 3 || images.some((image) => !(image instanceof File) || image.size > 5 * 1024 * 1024 || image.size === 0)) throw new DomainError("validation", "Choose up to three images, each under 5 MB.")
  await submitReview({ ...input.data, productId: input.data.productId || null, images: images as File[] })
  return Response.json({ ok: true, message: "Thanks! Your review will appear after our team checks it." }, { status: 202 })
})
