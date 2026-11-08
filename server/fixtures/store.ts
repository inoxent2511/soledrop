import "server-only"
import { AsyncLocalStorage } from "node:async_hooks"
import { type Actor, requireSystem } from "@/server/db/actor"
import { DomainError } from "@/server/shared/errors"

import type { Collection, Product } from "@/server/catalog/types"
import {
  attributeDefinitions,
  basePrices,
  brands,
  collections,
  customFieldDefinitions,
  openingStock,
  products,
  STORE_ID,
} from "@/server/fixtures/seed"
import { adminPermissionRows, adminSystemRoles, demoStaff } from "@/server/fixtures/admin-seed"
import { contentSeed } from "@/server/fixtures/content-seed"
import { commerceSeed } from "@/server/fixtures/commerce-seed"
import { searchSeed } from "@/server/fixtures/search-seed"
import type { FixtureTables } from "@/server/fixtures/tables"
import { serverEnv } from "@/lib/env.server"
import { LocalStore } from "@/server/db/local-store"
import { homeSeed } from "@/server/fixtures/home-seed"

/**
 * The in-memory database behind DATA_DRIVER=fixtures. Reference tables and repositories
 * reproduce transactional guarantees —
 * stock never below zero, idempotent order placement, legal state transitions — so the
 * storefront behaves the same on both drivers. Data lives for the life of the server process.
 */
/** Admin RBAC tables; demo staff only with ADMIN_DEMO_STAFF=on (A-011). */
function adminTables() {
  const demo = serverEnv.ADMIN_DEMO_STAFF === "on" ? demoStaff(serverEnv.SESSION_SECRET) : { members: [], links: [] }
  return {
    staffMembers: demo.members,
    adminPermissions: adminPermissionRows(),
    adminRoles: adminSystemRoles(),
    staffRoleLinks: demo.links,
    staffInvites: [],
    staffSessions: [],
  }
}

function createTables(): FixtureTables {
  return {
    home: { content: structuredClone(homeSeed), updatedAt: "2026-11-07T00:00:00.000Z" },
    stores: [
      {
        id: STORE_ID,
        slug: "soledrop",
        name: "Sole Drop",
        defaultCurrency: "PKR",
        defaultLocale: "en",
      },
    ],
    brands: structuredClone(brands),
    products: structuredClone(products) as Product[],
    collections: structuredClone(collections) as Collection[],
    attributeDefinitions: structuredClone(attributeDefinitions),
    customFieldDefinitions: structuredClone(customFieldDefinitions),
    priceLists: commerceSeed.priceLists,
    prices: [
      ...basePrices.map((price) => ({
        ...price,
        priceListId: commerceSeed.priceLists[0].id,
      })),
      ...commerceSeed.extraPrices,
    ],
    inventory: openingStock.map((row) => ({
      variantId: row.variantId,
      onHand: row.onHand,
      reserved: 0,
    })),
    reservations: [],
    inventoryMovements: [],
    carts: [],
    promotions: structuredClone(commerceSeed.promotions),
    promotionRedemptions: [],
    shippingZones: structuredClone(commerceSeed.shippingZones),
    taxRates: structuredClone(commerceSeed.taxRates),
    orders: [],
    payments: [],
    refunds: [],
    returns: [],
    orderNotes: [],
    media: [],
    orderSequence: { prefix: "SD", next: 10001 },
    customers: [],
    addresses: [],
    sessions: [],
    passwordResets: [],
    staffRoles: [],
    ...adminTables(),
    pages: structuredClone(contentSeed.pages),
    faqs: structuredClone(contentSeed.faqs),
    newsletter: [],
    contactMessages: [],
    searchSynonyms: structuredClone(searchSeed.synonyms),
    searchEvents: [],
    flags: structuredClone(commerceSeed.flags),
    outbox: [],
    webhookDeliveries: [],
    audit: [],
    rateLimits: new Map(),
    idempotency: new Map(),
    exchangeRates: structuredClone(commerceSeed.exchangeRates),
  }
}

const globalStore = globalThis as unknown as {
  __soledropFixtures?: FixtureTables
  __soledropSettingsApplied?: string
  __soledropLocal?: LocalStore<FixtureTables>
}

/** Local stores start empty. The catalogue migration is explicit and runs once, never on boot. */
export function createLocalTables(): FixtureTables {
  const tables = createTables()
  tables.stores[0].id = serverEnv.STORE_ID
  tables.adminRoles = tables.adminRoles.map((role) => ({ ...role, storeId: serverEnv.STORE_ID }))
  Object.assign(tables, {
    brands: [], products: [], collections: [], attributeDefinitions: [], customFieldDefinitions: [],
    prices: [], inventory: [], promotions: [], shippingZones: [], taxRates: [], pages: [], faqs: [], searchSynonyms: [],
    staffMembers: [], staffRoleLinks: [],
    home: null,
  })
  return tables
}

/** Explicit isolated QA seed source. Never includes staff credentials or merchant state. */
export function createDemoTables(): FixtureTables {
  const tables = structuredClone(createTables())
  tables.staffMembers = []; tables.staffRoleLinks = []; tables.staffSessions = []
  return tables
}

export function localStore(): LocalStore<FixtureTables> {
  return globalStore.__soledropLocal ??= new LocalStore(serverEnv.LOCAL_DATA_DIR, createLocalTables)
}

/** Graceful shutdown for local maintenance and restart verification. */
export async function closeLocalStore() {
  await globalStore.__soledropLocal?.close()
  delete globalStore.__soledropLocal
}

/**
 * The catalogue, settings and content that no shopper action changes; refreshed when their seed is
 * edited. Ids are fixed, so stock levels, carts and orders (separate tables) still line up.
 */
function settingsSeed() {
  return {
    brands,
    products: products as Product[],
    collections: collections as Collection[],
    attributeDefinitions,
    customFieldDefinitions,
    shippingZones: commerceSeed.shippingZones,
    taxRates: commerceSeed.taxRates,
    flags: commerceSeed.flags,
    exchangeRates: commerceSeed.exchangeRates,
    pages: contentSeed.pages,
    faqs: contentSeed.faqs,
  }
}

/**
 * The process-wide fixture tables (kept on globalThis so dev reloads don't reset carts). When a
 * catalogue or settings seed changes (the free-delivery threshold D-060, sample conditions D-068), those tables are swapped for the
 * new seed on the next request instead of waiting for a server restart; carts and orders stay.
 */
export function db(): FixtureTables {
  const scoped = fixtureScope.getStore()
  if (scoped) return scoped
  if (serverEnv.DATA_DRIVER === "local") return localStore().value
  const fresh = globalStore.__soledropFixtures === undefined
  const tables = (globalStore.__soledropFixtures ??= createTables())
  // Only `next dev` reloads modules; a production process keeps the seed it started with.
  if (serverEnv.NODE_ENV !== "development") return tables
  const seed = settingsSeed()
  const signature = JSON.stringify(seed)
  if (globalStore.__soledropSettingsApplied !== signature) {
    if (!fresh) Object.assign(tables, structuredClone(seed))
    globalStore.__soledropSettingsApplied = signature
  }
  return tables
}

/** Restores the seed state; used by tests (tests/integration). */
export function resetFixtures(): void {
  otherStores.clear()
  globalStore.__soledropFixtures = createTables()
  globalStore.__soledropSettingsApplied = JSON.stringify(settingsSeed())
}

const fixtureScope = new AsyncLocalStorage<FixtureTables>()
const otherStores = new Map<string, FixtureTables>()

function tablesForStore(storeId: string): FixtureTables {
  const root = globalStore.__soledropFixtures ??= createTables()
  if (root.stores.length === 1 && root.stores[0].id === storeId) return root
  let tables = otherStores.get(storeId)
  if (!tables) {
    tables = createLocalTables()
    tables.stores[0].id = storeId
    tables.adminRoles = tables.adminRoles.map((role) => ({ ...role, storeId }))
    otherStores.set(storeId, tables)
  }
  return tables
}

/** Isolated relations are the fixture equivalent of a store predicate on every query. */
export function withFixtureStore<T>(actor: Actor, operation: () => T): T {
  if (serverEnv.DATA_DRIVER === "local") {
    if (actor.storeId !== serverEnv.STORE_ID) throw new DomainError("forbidden", "You don't have access to this store.")
    return operation()
  }
  return fixtureScope.run(tablesForStore(actor.storeId), operation)
}

/** Explicit provisioning hook for fixture contract setup; never used by request services. */
export function fixtureTablesForStore(actor: Actor): FixtureTables {
  requireSystem(actor, ["migration", "bootstrap"])
  if (serverEnv.DATA_DRIVER !== "fixtures") throw new Error("Fixture provisioning cannot open a saved or SQL store")
  return tablesForStore(actor.storeId)
}

/**
 * Runs `work` as one atomic unit: on any throw the tables are restored, which is how the
 * fixtures driver mirrors a database transaction. Node runs it without interleaving because
 * `work` is synchronous.
 */
export function transaction<T>(work: (tables: FixtureTables) => T): T {
  const tables = db()
  const snapshot = structuredClone({
    ...tables,
    rateLimits: undefined,
    idempotency: undefined,
  })
  try {
    return work(tables)
  } catch (error) {
    Object.assign(tables, snapshot, {
      rateLimits: tables.rateLimits,
      idempotency: tables.idempotency,
    })
    throw error
  }
}
