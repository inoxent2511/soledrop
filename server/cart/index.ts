import "server-only"

import type { CartOperations as DomainOperations } from "@/server/cart/repository"
import { createMysqlCartRepository } from "@/server/cart/mysql.repository"

import { createFixturesCartRepository } from "@/server/cart/fixtures.repository"
import { createCartService } from "@/server/cart/service"
import { catalog } from "@/server/catalog"
import { selectRepository } from "@/server/db/driver"
import { inventory } from "@/server/inventory"
import { flags } from "@/server/platform/flags"
import { establishCartToken } from "@/server/db/context"
import { pricing } from "@/server/pricing"
import { promotionsRepository } from "@/server/promotions"
import { shippingRepository } from "@/server/shipping"

const repository = selectRepository<DomainOperations>({ mysql: createMysqlCartRepository,  fixtures: createFixturesCartRepository, })

/** The raw cart repository (admin abandoned-bag list). */
export const cartRepository = repository

export const cartService = () => {
  const service = createCartService({
    carts: repository(),
    catalog: catalog(),
    pricing: pricing(),
    inventory: inventory(),
    promotions: promotionsRepository(),
    shipping: shippingRepository(),
    enabledShippingCodes: async () => new Set(["standard", ...((await flags().isEnabled("express-delivery")) ? ["express"] : [])]),
  })
  return {
    ...service,
    async create(...args: Parameters<typeof service.create>) {
      const created = await service.create(...args)
      establishCartToken(created.token)
      return created
    },
  }
}

export { hashToken, type Destination, type PricedCart, type ShopperContext } from "@/server/cart/service"
export type * from "@/server/cart/types"
