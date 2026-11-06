import type { HomeContent } from "@/server/content/home-types"
import { announcement } from "@/content/navigation"
import { siteConfig } from "@/lib/site"

/** One-time migration and isolated QA only; never a fallback for a saved local catalogue. */
export const homeSeed: HomeContent = {
  announcement,
  heading: ["Find", "Your.", "Perfect", "Pair."],
  description: "Discover new and pre-loved footwear from the brands you love — at prices that make sense.",
  buttons: [{ label: "New shoes", href: "/collections/brand-new" }, { label: "Pre-loved", href: "/pre-loved" }],
  slides: [
    { src: "/images/site/hero-1.jpg", alt: "Volt green Nike trainer on a lime background" },
    { src: "/images/site/hero-2.jpg", alt: "Runner wearing neon Reebok running shoes on a concrete floor" },
    { src: "/images/site/collection-banner.jpg", alt: "Neon adidas running shoe lit in green and violet" },
  ],
  categories: [
    { title: ["Brand", "New"], href: "/collections/brand-new", image: { src: "/images/site/category-brand-new.png", alt: "" } },
    { title: ["Pre-", "Loved"], href: "/pre-loved", image: { src: "/images/site/category-pre-loved.png", alt: "" } },
  ],
  instagram: { href: siteConfig.social.instagram, handle: siteConfig.social.instagramHandle, images: [1, 2, 3, 4].map((n) => ({ src: `/images/site/instagram-${n}.jpg`, alt: "" })) },
}
