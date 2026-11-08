import "server-only"

import type { InventoryOperations as DomainOperations } from "@/server/inventory/repository"
import { createMysqlInventoryRepository } from "@/server/inventory/mysql.repository"

import { selectRepository } from "@/server/db/driver"
import { createFixturesInventoryRepository } from "@/server/inventory/fixtures.repository"

/** Inventory has no business rules beyond the repository's atomic guarantees, so it is used directly. */
export const inventory = selectRepository<DomainOperations>({ mysql: createMysqlInventoryRepository,  fixtures: createFixturesInventoryRepository, })
export type { InventoryOperations, StockRequest } from "@/server/inventory/repository"
