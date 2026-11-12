/** A link in the site chrome. `href` is always an internal path. */
export type NavLink = { label: string; href: string; tone?: "brand" }

/** A primary-nav item; `direct` items are a page of their own and open no dropdown (D-052, D-053). */
export type PrimaryNavLink = NavLink & { direct?: true }

/** Primary navigation — the four-item nav used on 7 of the 10 designed screens (D-006). */
export const primaryNav: PrimaryNavLink[] = [
  { label: "New Arrival", href: "/new-arrivals", direct: true },
  { label: "Men", href: "/collections/men" },
  { label: "Women", href: "/collections/women" },
  { label: "Sale", href: "/sale", tone: "brand", direct: true },
]

/**
 * The two choices under every dropdown primary-nav item (D-045, the owner's direction). Brand New
 * narrows the tab's own collection; one-off pre-loved pairs live in the Pre-Loved shop rather than
 * the Men and Women collections, so those tabs send Pre-Loved there with the matching filter.
 */
export const menuOptions = [
  { kind: "new", label: "Brand New" },
  { kind: "preloved", label: "Pre-Loved" },
] as const

/**
 * Primary-nav href → its shopper gender (D-067). Both of that tab's choices open with the Gender
 * filter ticked, so the shopper can see what they're looking at and untick it: Brand New narrows
 * the tab's collection, and Pre-Loved goes to the Pre-Loved shop (one-off pairs live there, D-045).
 */
export const tabGender: Record<string, "men" | "women"> = {
  "/collections/men": "men",
  "/collections/women": "women",
}

/** Links below the category tree in the mobile drawer. */
export const shortcutNav: NavLink[] = [
  { label: "Pre-Loved", href: "/pre-loved" },
  { label: "Size Guide", href: "/size-guide" },
  { label: "Track Order", href: "/orders/lookup" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact Us", href: "/contact" },
]

/** Search overlay: curated searches shown until the search log has enough history of its own. */
export const popularSearches = [
  "Air Max",
  "Gel-Kayano",
  "Running",
  "Pre-loved",
  "Bondi",
]

/** Search overlay: collections offered before the shopper types. */
export const popularCollections: NavLink[] = [
  { label: "New Arrival", href: "/new-arrivals" },
  { label: "Brand New", href: "/collections/brand-new" },
  { label: "Pre-Loved", href: "/pre-loved" },
  { label: "Sale", href: "/sale" },
]

/** Footer link columns, in design order. */
export const footerColumns: { title: string; links: NavLink[] }[] = [
  {
    title: "Shop",
    links: [
      { label: "New Arrival", href: "/new-arrivals" },
      { label: "Brand New", href: "/collections/brand-new" },
      { label: "Pre-Loved", href: "/pre-loved" },
      { label: "Sale", href: "/sale" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Track Your Order", href: "/orders/lookup" },
      { label: "Contact Us", href: "/contact" },
      { label: "FAQ", href: "/faq" },
      { label: "Size Guide", href: "/size-guide" },
      { label: "Condition Guide", href: "/condition-guide" },
      { label: "Shipping & Delivery Policy", href: "/shipping" },
      { label: "Returns, Exchanges & Refunds Policy", href: "/returns" },
      { label: "Terms & Conditions", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
  {
    title: "About",
    links: [
      { label: "About Sole Drop", href: "/pages/about" },
      { label: "Our Story", href: "/pages/our-story" },
      { label: "Customer Reviews", href: "/reviews" },
    ],
  },
]

export const announcement = "🔥 NEW DROP IS LIVE — LIMITED PAIRS"
export const promoBar = {
  text: "🚚 Free delivery on orders above Rs. 12,000",
  cta: "SHOP NOW",
  href: "/new-arrivals",
}
