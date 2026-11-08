import "server-only"

import type { PricingOperations as DomainOperations } from "@/server/pricing/repository"
import { createMysqlPricingRepository } from "@/server/pricing/mysql.repository"

import { selectRepository } from "@/server/db/driver"
import { createFixturesPricingRepository } from "@/server/pricing/fixtures.repository"
import { createPricingService } from "@/server/pricing/service"

const repository = selectRepository<DomainOperations>({ mysql: createMysqlPricingRepository,  fixtures: createFixturesPricingRepository, })

export const pricing = () => createPricingService(repository())
export type { PriceList, PriceRow, ExchangeRates } from "@/server/pricing/types"
