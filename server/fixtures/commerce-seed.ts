import type { FeatureFlag } from "@/server/platform/types"
import type { ExchangeRates, PriceList, PriceRow } from "@/server/pricing/types"
import type { Promotion } from "@/server/promotions/types"
import type { ShippingZone, TaxRate } from "@/server/shipping/types"
import { basePrices, products, STORE_ID } from "@/server/fixtures/seed"

const priceLists: PriceList[] = [
  { id: "50000000-0000-4000-8000-000000000001", code: "retail-pkr", currency: "PKR", customerGroup: null, priority: 0, startsAt: null, endsAt: null },
  { id: "50000000-0000-4000-8000-000000000002", code: "wholesale-pkr", currency: "PKR", customerGroup: "wholesale", priority: 10, startsAt: null, endsAt: null },
]

/**
 * Store policies from the design: free delivery above Rs. 12,000 (promo bar, the owner's change D-060), Rs. 250 standard
 * delivery (cart summary), 7-day returns (PDP). Amounts are minor units.
 */
const shippingZones: ShippingZone[] = [
  {
    id: "60000000-0000-4000-8000-000000000001",
    name: "Pakistan",
    countries: ["PK"],
    cities: [],
    position: 0,
    rates: [
      { code: "standard", label: "Standard delivery", amount: 25000, freeOver: 1200000, minDays: 2, maxDays: 5, cashOnDelivery: true },
      { code: "express", label: "Express delivery (Karachi, Lahore, Islamabad)", amount: 60000, freeOver: null, minDays: 1, maxDays: 2, cashOnDelivery: true },
    ],
  },
]

const taxRates: TaxRate[] = [{ country: "PK", province: null, label: "GST", basisPoints: 1800, inclusive: true }]

const promotions: Promotion[] = [
  {
    id: "70000000-0000-4000-8000-000000000001",
    storeId: STORE_ID,
    code: "WELCOME10",
    title: "10% off your first order",
    conditions: [{ type: "first_order" }],
    actions: [{ type: "percent_off_order", basisPoints: 1000 }],
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    perCustomerLimit: 1,
    timesUsed: 0,
    active: true,
    combinable: false,
  },
  {
    id: "70000000-0000-4000-8000-000000000002",
    storeId: STORE_ID,
    code: "PRELOVED500",
    title: "Rs. 500 off pre-loved pairs over Rs. 10,000",
    conditions: [
      { type: "product_kind", kind: "preloved" },
      { type: "subtotal_at_least", amount: 1000000 },
    ],
    actions: [{ type: "fixed_off_order", amount: 50000 }],
    startsAt: null,
    endsAt: null,
    usageLimit: 500,
    perCustomerLimit: null,
    timesUsed: 0,
    active: true,
    combinable: true,
  },
]

const flags: FeatureFlag[] = [
  { key: "b2b-pricing", description: "Wholesale price list and quote requests for approved trade accounts.", enabled: false, customerGroups: ["wholesale"] },
  { key: "multi-currency-display", description: "Show approximate prices in USD / AED / GBP next to PKR.", enabled: false },
  { key: "stripe-payments", description: "Card payments through Stripe (needs STRIPE_SECRET_KEY).", enabled: false },
  { key: "express-delivery", description: "Offer the express delivery rate at checkout.", enabled: true },
]

const exchangeRates: ExchangeRates = {
  base: "PKR",
  rates: { PKR: 1, USD: 0.0036, AED: 0.0132, GBP: 0.0028 },
  updatedAt: "2026-11-01T00:00:00.000Z",
}

/** Wholesale list: 15 % under retail on brand-new stock (exercised when the b2b-pricing flag is on). */
const newVariantIds = new Set(products.filter((product) => product.kind === "new").flatMap((product) => product.variants.map((variant) => variant.id)))
const extraPrices: PriceRow[] = basePrices
  .filter((price) => newVariantIds.has(price.variantId))
  .map((price) => ({
    priceListId: priceLists[1].id,
    variantId: price.variantId,
    amount: Math.round((price.amount * 85) / 10000) * 100,
    compareAt: null,
  }))

export const commerceSeed = { priceLists, shippingZones, taxRates, promotions, flags, exchangeRates, extraPrices }
