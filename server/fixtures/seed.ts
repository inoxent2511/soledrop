import type {
  AttributeDefinition,
  Brand,
  Collection,
  ConditionGrade,
  CustomFieldDefinition,
  Gender,
  Product,
  ProductImage,
  ProductKind,
  SizeChart,
} from "@/server/catalog/types"
import { mensSizeByEu } from "@/content/size-guide"

/**
 * Seed catalogue. Product names, prices, sizes and photos are the design's sample data
 * (design/spec/outline), so every designed screen can be reproduced; copy that the design
 * doesn't show (descriptions, condition notes) is written to the content rules in
 * docs/app/content-rules.md and is replaceable by the owner (docs/app/phase-2.md).
 * The same data seeds Postgres via `node scripts/db-seed-sql.mjs`.
 */

export const STORE_ID = "00000000-0000-4000-8000-000000000001"

/** EU sizes with UK/US/CM from the Size Guide table (men's chart). */
export const SIZE_CHART: Record<string, SizeChart> = mensSizeByEu

const brandList: [string, string][] = [
  ["nike", "Nike"],
  ["adidas", "Adidas"],
  ["jordan", "Jordan"],
  ["puma", "Puma"],
  ["new-balance", "New Balance"],
  ["skechers", "Sketchers"],
  ["reebok", "Reebok"],
  ["asics", "Asics"],
  ["hoka", "Hoka"],
  ["brooks", "Brooks"],
]

export const brands: Brand[] = brandList.map(([slug, name], index) => ({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  slug,
  name,
  position: index,
}))

const brand = (slug: string) => {
  const found = brands.find((item) => item.slug === slug)
  if (!found) throw new Error(`Unknown brand ${slug}`)
  return found
}

const productImage = (file: string, alt: string, size = 1254): ProductImage => ({
  url: `/images/products/${file}`,
  alt,
  width: size,
  height: size,
})

const gallery = (base: string, alt: string) =>
  [1, 2, 3, 4, 5, 6].map((index) => productImage(`${base}-${index}.png`, `${alt} — view ${index}`, 2000))

type SeedProduct = {
  slug: string
  title: string
  brand: string
  kind: ProductKind
  gender: Gender
  price: number
  compareAt: number | null
  sizes: string[]
  card: string
  images?: ProductImage[]
  condition?: ConditionGrade
  conditionNotes?: string
  /** Pre-loved items carry the size printed on their tag, which can differ from the chart. */
  tagSize?: SizeChart
  description: string
  collections: string[]
  tags?: string[]
  attributes: Record<string, string | number | boolean>
  stock: number
}

const newDescription = (title: string, detail: string) =>
  `${title} — ${detail} Brand new in the original box, sourced from authorised distributors.`

const seedProducts: SeedProduct[] = [
  {
    slug: "asics-gel-kayano-30",
    title: "ASICS Gel-Kayano 30",
    brand: "asics",
    kind: "new",
    gender: "men",
    price: 28999,
    compareAt: 34999,
    sizes: ["41", "42", "43", "44"],
    card: "asics-gel-kayano-30-card.png",
    description: newDescription("ASICS Gel-Kayano 30", "a stability running shoe with 4D Guidance System and FF Blast+ cushioning for long, steady miles."),
    collections: ["new-arrivals", "men", "brand-new", "sale"],
    attributes: { colour: "Black / Lime", activity: "Running", closure: "Laces" },
    stock: 6,
  },
  {
    slug: "nike-air-max",
    title: "NIKE Air Max",
    brand: "nike",
    kind: "new",
    gender: "unisex",
    price: 28999,
    compareAt: 34999,
    sizes: ["41", "42", "43", "44"],
    card: "nike-air-max-card.png",
    description: newDescription("Nike Air Max", "visible Air cushioning and a breathable mesh upper in a bright, colour-blocked finish."),
    collections: ["new-arrivals", "women", "brand-new", "sale"],
    attributes: { colour: "White / Orange / Lilac", activity: "Lifestyle", closure: "Laces" },
    stock: 6,
  },
  {
    slug: "brooks-glycerin-20",
    title: "BROOKS Glycerin 20",
    brand: "brooks",
    kind: "new",
    gender: "men",
    price: 28999,
    compareAt: 34999,
    sizes: ["41", "42", "43", "44"],
    card: "brooks-glycerin-20-card.png",
    description: newDescription("Brooks Glycerin 20", "max-cushion neutral trainer with DNA LOFT v3 foam for soft, smooth daily runs."),
    collections: ["new-arrivals", "men", "brand-new", "sale"],
    attributes: { colour: "Black / Orange / Yellow", activity: "Running", closure: "Laces" },
    stock: 6,
  },
  {
    slug: "adidas-duramo-sl",
    title: "ADIDAS Duramo SL",
    brand: "adidas",
    kind: "new",
    gender: "unisex",
    price: 28999,
    compareAt: 34999,
    sizes: ["41", "42", "43", "44"],
    card: "adidas-duramo-sl-card.png",
    description: newDescription("adidas Duramo SL", "a light, everyday runner with Lightmotion cushioning and a supportive mesh upper."),
    collections: ["new-arrivals", "men", "brand-new", "sale"],
    attributes: { colour: "Royal Blue / White", activity: "Running", closure: "Laces" },
    stock: 6,
  },
  {
    slug: "asics-gel-kayano-30-black-silver",
    title: "ASICS Gel-Kayano 30",
    brand: "asics",
    kind: "new",
    gender: "men",
    price: 14999,
    compareAt: 19999,
    sizes: ["41", "42", "43", "44"],
    card: "asics-gel-kayano-30-card.png",
    images: gallery("asics-gel-kayano-30", "ASICS Gel-Kayano 30 in black and silver"),
    description: newDescription("ASICS Gel-Kayano 30", "this black and silver colourway pairs the 4D Guidance System with PureGEL in the heel for a softer landing."),
    collections: ["new-arrivals", "men", "brand-new", "sale"],
    attributes: { colour: "Black / Silver", activity: "Running", closure: "Laces" },
    stock: 6,
  },
  {
    slug: "nike-air-max-summit-white",
    title: "NIKE Air Max",
    brand: "nike",
    kind: "new",
    gender: "unisex",
    price: 28999,
    compareAt: 34999,
    sizes: ["41", "42", "43", "44"],
    card: "nike-air-max-card.png",
    description: newDescription("Nike Air Max", "Summit White colourway with a padded collar and durable rubber outsole."),
    collections: ["new-arrivals", "women", "brand-new", "sale"],
    attributes: { colour: "Summit White", activity: "Lifestyle", closure: "Laces" },
    stock: 6,
  },
  {
    slug: "nike-air-max-hyper-violet",
    title: "NIKE Air Max",
    brand: "nike",
    kind: "new",
    gender: "unisex",
    price: 28999,
    compareAt: 34999,
    sizes: ["41", "42", "43", "44"],
    card: "nike-air-max-card.png",
    description: newDescription("Nike Air Max", "Hyper Violet accents on a lightweight build sized for growing feet."),
    collections: ["new-arrivals", "kids", "brand-new", "sale"],
    attributes: { colour: "White / Hyper Violet", activity: "Lifestyle", closure: "Laces" },
    stock: 6,
  },
  {
    slug: "brooks-glycerin-20-blue",
    title: "BROOKS Glycerin 20",
    brand: "brooks",
    kind: "new",
    gender: "unisex",
    price: 28999,
    compareAt: 34999,
    sizes: ["41", "42", "43", "44"],
    card: "brooks-glycerin-20-card.png",
    description: newDescription("Brooks Glycerin 20", "Blue Opal colourway with a plush, stretch-woven upper."),
    collections: ["new-arrivals", "women", "brand-new", "sale"],
    attributes: { colour: "Black / Blue / Orange", activity: "Running", closure: "Laces" },
    stock: 6,
  },
  {
    slug: "adidas-duramo-sl-core-black",
    title: "ADIDAS Duramo SL",
    brand: "adidas",
    kind: "new",
    gender: "unisex",
    price: 28999,
    compareAt: 34999,
    sizes: ["41", "42", "43", "44"],
    card: "adidas-duramo-sl-card.png",
    description: newDescription("adidas Duramo SL", "Lucid Blue colourway built for gym sessions and easy runs alike."),
    collections: ["new-arrivals", "women", "brand-new", "sale"],
    attributes: { colour: "Lucid Blue / White", activity: "Training", closure: "Laces" },
    stock: 6,
  },
  {
    slug: "adidas-ozweego",
    title: "ADIDAS OZWEEGO",
    brand: "adidas",
    kind: "new",
    gender: "men",
    price: 32999,
    compareAt: null,
    sizes: ["41", "42", "43", "44"],
    card: "adidas-ozweego-card.png",
    description: newDescription("adidas OZWEEGO", "a chunky, '90s-inspired silhouette with Adiprene cushioning and a suede-and-mesh upper."),
    collections: ["featured", "men", "brand-new"],
    attributes: { colour: "Grey Two / Grey Three", activity: "Lifestyle", closure: "Laces" },
    stock: 8,
  },
  ...preloved(),
]

function preloved(): SeedProduct[] {
  const items: [string, string, string, string, string, ConditionGrade][] = [
    // Sample pairs spread over all five grades so every condition can be seen on the Pre-Loved shop (D-068, grades D-069).
    ["nike-vaporfly-3-orange", "NIKE Vaporfly 3", "nike", "nike-vaporfly-3-orange-card.png", "White / Total Orange", "like-new"],
    ["adidas-ozweego-grey", "ADIDAS OZWEEGO", "adidas", "adidas-ozweego-card.png", "Grey Two", "excellent"],
    ["hoka-bondi-7-blue", "HOKA Bondi 7", "hoka", "hoka-bondi-7-blue-card.png", "Real Teal / Evening Primrose", "very-good"],
    ["nike-vaporfly-3-teal", "NIKE Vaporfly 3", "nike", "nike-vaporfly-3-teal-card.png", "Jade Ice / Black", "minor-issue"],
    ["adidas-ozweego-grey-2", "ADIDAS OZWEEGO", "adidas", "adidas-ozweego-card.png", "Grey Three", "premium"],
    ["hoka-bondi-7-blue-2", "HOKA Bondi 7", "hoka", "hoka-bondi-7-blue-card.png", "Real Teal", "like-new"],
    ["nike-vaporfly-3-orange-2", "NIKE Vaporfly 3", "nike", "nike-vaporfly-3-orange-card.png", "White / Total Orange", "excellent"],
    ["adidas-ozweego-grey-3", "ADIDAS OZWEEGO", "adidas", "adidas-ozweego-card.png", "Grey Two", "very-good"],
  ]
  /** A grader's note in the words the Condition Guide uses for each grade. */
  const notes: Record<ConditionGrade, string> = {
    "like-new": "Worn once or twice indoors. Upper spotless with no creasing, midsole bright with no compression, outsole tread as new. Cleaned before listing.",
    premium: "Worn a handful of times. Upper clean with faint toe creasing; midsole shows light creasing; outsole tread above 90 %. Cleaned before listing.",
    excellent: "Regular use, well looked after. Minor creasing on the upper, light surface marks on the midsole, even outsole wear with good grip. Cleaned before listing.",
    "very-good": "Noticeable everyday wear, still reliable. Creasing and small scuffs on the upper, light yellowing on the midsole, even outsole wear. Cleaned before listing.",
    "minor-issue": "A small scuff on the toe box and light marks along the midsole, all shown in the photos and reflected in the price. Outsole still grips well. Cleaned before listing.",
  }
  const list: SeedProduct[] = items.map(([slug, title, brandSlug, card, colour, condition]) => ({
    slug,
    title,
    brand: brandSlug,
    kind: "preloved",
    gender: "unisex",
    price: 28999,
    compareAt: 34999,
    sizes: ["40"],
    card,
    condition,
    conditionNotes: notes[condition],
    description: `${title} — a one-off pre-loved pair, inspected and graded by our team. What you see is the exact pair you get.`,
    collections: ["pre-loved"],
    attributes: { colour, activity: "Running", closure: "Laces" },
    stock: 1,
  }))
  list.push({
    slug: "hoka-bondi-7-grey",
    title: "HOKA Bondi 7",
    brand: "hoka",
    kind: "preloved",
    gender: "men",
    price: 14999,
    compareAt: 19999,
    sizes: ["42"],
    tagSize: { eu: "42", uk: "6", us: "8", cm: "27" },
    card: "hoka-bondi-7-grey-1.png",
    images: gallery("hoka-bondi-7-grey", "Pre-loved HOKA Bondi 7 in grey"),
    condition: "premium",
    conditionNotes:
      "Worn twice indoors. Upper spotless, midsole foam bright with no compression lines, outsole as new. Original insoles included.",
    description:
      "HOKA Bondi 7 — HOKA's most cushioned road shoe, a one-off pre-loved pair inspected and graded by our team. The size shown is the size printed on the tag.",
    collections: ["pre-loved", "featured"],
    attributes: { colour: "Grey / White", activity: "Running", closure: "Laces" },
    stock: 1,
  })
  return list
}

const day = 24 * 60 * 60 * 1000
const seedEpoch = Date.UTC(2026, 9, 1)

export const products: Product[] = seedProducts.map((item, index) => {
  const id = `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
  const cardImage = productImage(item.card, `${item.title} side profile`, item.card.endsWith("-1.png") ? 2000 : 1254)
  return {
    id,
    storeId: STORE_ID,
    slug: item.slug,
    title: item.title,
    brand: brand(item.brand),
    kind: item.kind,
    gender: item.gender,
    status: "active",
    description: item.description,
    condition: item.condition ?? null,
    conditionNotes: item.conditionNotes ?? null,
    images: [{ ...cardImage, role: "card" as const }, ...(item.images ?? []).map((image) => ({ ...image, role: "gallery" as const }))],
    variants: item.sizes.map((size, position) => ({
      id: `30000000-0000-4000-8${String(index + 1).padStart(3, "0")}-${String(position + 1).padStart(12, "0")}`,
      sku: `SD-${item.slug.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-${size}`,
      size: item.tagSize ?? SIZE_CHART[size],
      attributes: {},
      weightGrams: 900,
      position,
    })),
    attributes: item.attributes,
    customFields: {},
    collections: item.collections,
    tags: item.tags ?? [],
    position: index,
    publishedAt: new Date(seedEpoch + index * day).toISOString(),
    seo: {},
  }
})

/** Base PKR price list entries, in minor units, keyed by variant. */
export const basePrices = products.flatMap((product, index) =>
  product.variants.map((variant) => ({
    variantId: variant.id,
    amount: seedProducts[index].price * 100,
    compareAt: seedProducts[index].compareAt === null ? null : seedProducts[index].compareAt! * 100,
  })),
)

/** Opening stock per variant. */
export const openingStock = products.flatMap((product, index) =>
  product.variants.map((variant) => ({ variantId: variant.id, onHand: seedProducts[index].stock })),
)

const collectionImage = (file: string): ProductImage => ({ url: `/images/site/${file}`, alt: "", width: 2400, height: 1600 })

const collection = (
  slug: string,
  title: string,
  headline: [string, string],
  description: string,
  position: number,
): Collection => ({
  id: `40000000-0000-4000-8000-${String(position + 1).padStart(12, "0")}`,
  storeId: STORE_ID,
  slug,
  title,
  headline,
  description,
  kind: "manual",
  rules: [],
  image: collectionImage("collection-banner.jpg"),
  position,
  seo: {},
})

export const collections: Collection[] = [
  collection("new-arrivals", "New Arrival", ["Every step", "matters"], "From everyday essentials to standout styles, find the perfect shoes for you.", 0),
  collection("men", "Men", ["Every step", "matters"], "Running, training and everyday pairs for men — new and pre-loved.", 1),
  collection("women", "Women", ["Every step", "matters"], "Running, training and everyday pairs for women — new and pre-loved.", 2),
  collection("kids", "Kids", ["Every step", "matters"], "Durable, comfortable pairs sized for growing feet.", 3),
  {
    ...collection("sale", "Sale", ["Every step", "matters"], "Marked-down pairs while sizes last.", 4),
    kind: "rule",
    rules: [{ field: "onSale", equals: true }],
  },
  {
    ...collection("brand-new", "Brand New", ["Every step", "matters"], "Brand new, boxed pairs from authorised distributors.", 5),
    kind: "rule",
    rules: [{ field: "kind", equals: "new" }],
  },
  {
    ...collection("pre-loved", "Pre-Loved", ["Every step", "matters"], "One-off pairs, inspected, cleaned and graded so you know exactly what you're getting.", 6),
    kind: "rule",
    rules: [{ field: "kind", equals: "preloved" }],
  },
  collection("featured", "Featured Drop", ["Featured", "drop"], "This week's featured pair.", 7),
]

export const attributeDefinitions: AttributeDefinition[] = [
  { code: "colour", label: "Colour", type: "text", scope: "product", filterable: false, position: 0 },
  {
    code: "activity",
    label: "Activity",
    type: "enum",
    scope: "product",
    options: ["Running", "Training", "Lifestyle", "Basketball"].map((value) => ({ value, label: value })),
    filterable: true,
    position: 1,
  },
  {
    code: "closure",
    label: "Closure",
    type: "enum",
    scope: "product",
    options: ["Laces", "Slip-on", "Velcro"].map((value) => ({ value, label: value })),
    filterable: false,
    position: 2,
  },
]

export const customFieldDefinitions: CustomFieldDefinition[] = [
  { entity: "order", code: "gift_note", label: "Gift note", type: "text", required: false, visibleOnStorefront: true },
  { entity: "product", code: "box_included", label: "Original box included", type: "boolean", required: false, visibleOnStorefront: true },
]
