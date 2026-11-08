import "server-only"
import { createMysqlPricingRepository } from "@/server/pricing/mysql.repository"

import { selectRepository } from "@/server/db/driver"
import { createFixturesPricingRepository } from "@/server/pricing/fixtures.repository"
import { createPricingService } from "@/server/pricing/service"
import { createSupabasePricingRepository } from "@/server/pricing/supabase.repository"

const repository = selectRepository({ mysql: createMysqlPricingRepository,  fixtures: createFixturesPricingRepository, supabase: createSupabasePricingRepository })

export const pricing = () => createPricingService(repository())
export type { PriceList, PriceRow, ExchangeRates } from "@/server/pricing/types"
