import "server-only"

import { createFixturesCartRepository } from "@/server/cart/fixtures.repository"
import { createCartService } from "@/server/cart/service"
import { createSupabaseCartRepository } from "@/server/cart/supabase.repository"
import { catalog } from "@/server/catalog"
import { selectRepository } from "@/server/db/driver"
import { inventory } from "@/server/inventory"
import { flags } from "@/server/platform/flags"
import { pricing } from "@/server/pricing"
import { promotionsRepository } from "@/server/promotions"
import { shippingRepository } from "@/server/shipping"

const repository = selectRepository({ fixtures: createFixturesCartRepository, supabase: createSupabaseCartRepository })

/** The raw cart repository (admin abandoned-bag list). */
export const cartRepository = repository

export const cartService = () =>
  createCartService({
    carts: repository(),
    catalog: catalog(),
    pricing: pricing(),
    inventory: inventory(),
    promotions: promotionsRepository(),
    shipping: shippingRepository(),
    enabledShippingCodes: async () => new Set(["standard", ...((await flags().isEnabled("express-delivery")) ? ["express"] : [])]),
  })

export { hashToken, type Destination, type PricedCart, type ShopperContext } from "@/server/cart/service"
export type * from "@/server/cart/types"
