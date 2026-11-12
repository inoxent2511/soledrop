import { publicEnv } from "@/lib/env"

/** Store identity used by metadata, structured data and the footer. Copy comes from the design. */
export const siteConfig = {
  name: "Sole Drop",
  tagline: "New and pre-loved footwear",
  description: "Fresh finds. Fresh steps. New and pre-loved footwear from brands you love.",
  url: publicEnv.NEXT_PUBLIC_SITE_URL,
  locale: "en",
  dir: "ltr",
  currency: "PKR",
  contact: {
    whatsappLabel: "03045163651",
    whatsappHref: "https://wa.me/923045163651",
    email: "support@soledrop.store",
    address: "237, street no 5, Karachi",
    /** Support days from the design; the opening times are the owner's to supply (null hides the line). */
    supportDays: "Mon - Sat",
    supportHours: null as string | null,
  },
  social: {
    instagramHandle: "@Soledropoffical",
    instagram: "https://www.instagram.com/soledropofficial",
    facebook: "https://www.facebook.com/soledropofficial",
    tiktok: "https://www.tiktok.com/@soledropofficial",
  },
} as const
