import "server-only"

import { selectRepository } from "@/server/db/driver"
import { createFixturesInventoryRepository } from "@/server/inventory/fixtures.repository"
import { createSupabaseInventoryRepository } from "@/server/inventory/supabase.repository"

/** Inventory has no business rules beyond the repository's atomic guarantees, so it is used directly. */
export const inventory = selectRepository({ fixtures: createFixturesInventoryRepository, supabase: createSupabaseInventoryRepository })
export type { InventoryOperations, StockRequest } from "@/server/inventory/repository"
