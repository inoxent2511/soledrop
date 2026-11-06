import "@/lib/validation"
import { z } from "zod"

const internalLink = z.string().trim().max(300).regex(/^\/(?!\/)[^\s\\]*$/, "Use a link on this site, starting with /")
// Legacy image paths allow editing the explicit QA fixtures. The server requires existing media
// records for saved local and Supabase stores, including same-store ownership.
const image = z.object({ src: z.string().regex(/^\/(?:media\/[0-9a-f-]+\.webp|images\/[\w./-]+)$/, "Choose an uploaded image"), alt: z.string().trim().max(300) })
export const homeInput = z.object({
  announcement: z.string().trim().max(300),
  heading: z.tuple([z.string().trim().max(30), z.string().trim().max(30), z.string().trim().max(30), z.string().trim().max(30)]),
  description: z.string().trim().max(600),
  buttons: z.array(z.object({ label: z.string().trim().min(1).max(40), href: internalLink })).max(2),
  slides: z.array(image).max(10),
  categories: z.array(z.object({ title: z.tuple([z.string().trim().max(40), z.string().trim().max(40)]).refine((lines) => lines.some(Boolean), "Add a category title"), href: internalLink, image })).max(8),
  instagram: z.object({
    href: z.url().max(300).refine((value) => { const u = new URL(value); return u.protocol === "https:" && ["instagram.com", "www.instagram.com"].includes(u.hostname) && !u.username && !u.password }, "Use an HTTPS Instagram profile link"),
    handle: z.string().trim().max(80), images: z.array(image).max(12),
  }),
})
export const homeSaveInput = z.object({ content: homeInput, expectedUpdatedAt: z.iso.datetime().nullable() })
