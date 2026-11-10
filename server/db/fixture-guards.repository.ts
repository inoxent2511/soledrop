import "server-only"

import { type Actor, requireCustomerOwner, requireGrant, requireStore, requireSystem } from "./actor"
import type { FixtureGuards, FixtureProjections } from "./fixtures-policy.repository"
import type { Permission } from "@/server/admin/permissions"
import type { CatalogOperations } from "@/server/catalog/repository"
import type { CartOperations } from "@/server/cart/repository"
import type { ContentOperations } from "@/server/content/repository"
import type { InventoryOperations } from "@/server/inventory/repository"
import type { MediaOperations } from "@/server/media/repository"
import type { PricingOperations } from "@/server/pricing/repository"
import type { PromotionOperations } from "@/server/promotions/repository"
import type { SearchOperations } from "@/server/search/repository"
import type { ShippingOperations } from "@/server/shipping/repository"
import { db } from "@/server/fixtures/store"
import { DomainError } from "@/server/shared/errors"

const store = (actor: Actor, storeId: string) => requireStore(actor, storeId)
const publicRead = (actor: Actor) => requireStore(actor, actor.storeId)
const grant = (permission: Permission) => (actor: Actor) => requireGrant(actor, permission)
const storeGrant = (permission: Permission) => (actor: Actor, storeId: string) => { store(actor, storeId); requireGrant(actor, permission) }
const trusted = (actor: Actor) => actor.kind === "system" && ["migration", "integration"].includes(actor.purpose)
export function jobGrant(actor: Actor) { if (actor.kind !== "system" || !["jobs", "migration"].includes(actor.purpose)) requireGrant(actor, "jobs:run") }
export function actionLabel(actor: Actor, label: string) { if (actor.kind === "staff" && label !== actor.id && label !== "staff:" + actor.id) throw new DomainError("forbidden", "Action identity does not match the actor.") }

export function fixtureCartOwner(actor: Actor, id: string) {
  const cart = db().carts.find((row) => row.id === id && row.storeId === actor.storeId)
  if (!cart) throw new DomainError("not_found", "Cart not found.")
  if (trusted(actor) || actor.kind === "system" && actor.purpose === "jobs") return cart
  if (actor.kind === "staff") { requireGrant(actor, "orders:write"); return cart }
  if (actor.kind === "customer" && cart.customerId === actor.id || (actor.kind === "anonymous" || actor.kind === "customer") && !cart.customerId && actor.cartTokenHash === cart.tokenHash) return cart
  throw new DomainError("not_found", "Cart not found.")
}

export const catalogGuards: FixtureGuards<CatalogOperations> = {
  listProducts: store, getProductBySlug: store, getProductsByVariantIds: publicRead,
  listCollections: store, listBrands: store, listAttributeDefinitions: store, listCustomFieldDefinitions: store,
  upsertProducts(actor, storeId, products) { storeGrant("products:import")(actor, storeId); requireGrant(actor, "products:write"); for (const product of products) { requireStore(actor, product.storeId); if (product.status === "active") requireGrant(actor, "products:publish") } },
  searchProducts: storeGrant("products:read"), getProductById: storeGrant("products:read"), reportProducts: storeGrant("reports:read"),
  saveProduct(actor, storeId, product) {
    storeGrant("products:write")(actor, storeId); requireStore(actor, product.storeId)
    const current = db().products.find((row) => row.id === product.id)
    if (!current && product.status === "active" || current && current.status !== product.status) requireGrant(actor, "products:publish")
    if (!db().brands.some((row) => row.id === product.brand.id)) throw new DomainError("validation", "Brand not found.")
    if (product.collections.some((slug) => !db().collections.some((row) => row.slug === slug))) throw new DomainError("validation", "Collection not found.")
  },
  deleteProduct: storeGrant("products:delete"),
  saveCollection(actor, storeId, collection, ids) { storeGrant("collections:write")(actor, storeId); requireStore(actor, collection.storeId); if (ids?.some((id) => !db().products.some((row) => row.id === id))) throw new DomainError("validation", "Product not found.") },
  deleteCollection: storeGrant("collections:write"), collectionProductIds: storeGrant("collections:read"), createBrand: storeGrant("products:write"),
}

export const contentGuards: FixtureGuards<ContentOperations> = {
  home: store, saveHome: storeGrant("content:write"), listPages: store, getPage: store, listFaqs: store, subscribe: store,
  unsubscribe(actor, storeId) { store(actor, storeId); requireSystem(actor, ["auth:customer", "migration"]) },
  saveContactMessage: store, staffPages: storeGrant("content:read"), staffPage: storeGrant("content:read"),
  savePage: storeGrant("content:write"), deletePage: storeGrant("content:write"), saveFaq: storeGrant("content:write"), deleteFaq: storeGrant("content:write"), reorderFaqs: storeGrant("content:write"), listSubscribers: storeGrant("marketing:read"),
}
export const searchGuards: FixtureGuards<SearchOperations> = { listSynonyms: store, logEvent: store, trending: store, report: storeGrant("search:read"), similarQueries: storeGrant("search:read"), saveSynonym: storeGrant("search:write"), deleteSynonym: storeGrant("search:write") }
export const shippingGuards: FixtureGuards<ShippingOperations> = { listZones: store, listTaxRates: store, saveZone: storeGrant("shipping:write"), deleteZone: storeGrant("shipping:write"), replaceTaxRates: storeGrant("shipping:write") }
export const pricingGuards: FixtureGuards<PricingOperations> = {
  listPriceLists: store, listPrices: publicRead, getExchangeRates: store,
  upsertPrices(actor, rows) { requireGrant(actor, "pricing:write"); for (const row of rows) if (!db().priceLists.some((list) => list.id === row.priceListId) || !db().products.some((product) => product.variants.some((variant) => variant.id === row.variantId))) throw new DomainError("not_found", "Price list or product not found.") },
}
export const mediaGuards: FixtureGuards<MediaOperations> = {
  list: storeGrant("media:read"), find: storeGrant("media:read"), findById: publicRead,
  create(actor, item) {
    storeGrant("media:write")(actor, item.storeId)
    if (!item.path.startsWith(actor.storeId + "/") || /[\\\x00-\x1f]/.test(item.path) || item.path.split("/").some((part) => !part || part === "." || part === "..")) throw new DomainError("validation", "Invalid media key.")
    if (db().media.some((row) => row.id === item.id || row.path === item.path)) throw new DomainError("conflict", "Media already exists.")
    if (actor.kind === "staff" && item.createdBy !== actor.id) throw new DomainError("forbidden", "Upload identity does not match the actor.")
  },
  updateAlt: storeGrant("media:write"), remove: storeGrant("media:write"),
  read: publicRead, readVariant: publicRead,
  hasOrderUsage: storeGrant("media:read"),
  usage: storeGrant("media:read"),
  stage(actor, item, data) { mediaGuards.create(actor, item, data) },
  commitPrepared(actor, item) { mediaGuards.create(actor, item, new Uint8Array()) },
}
export const inventoryGuards: FixtureGuards<InventoryOperations> = {
  search: storeGrant("inventory:read"),
  availability(actor, _ids, cartId) { if (cartId) fixtureCartOwner(actor, cartId) },
  reserve(actor, cartId) { fixtureCartOwner(actor, cartId) }, release(actor, cartId) { fixtureCartOwner(actor, cartId) },
  onHand: grant("inventory:read"), releaseExpired: jobGrant,
  adjust(actor, _id, _delta, _reason, label) { requireGrant(actor, "inventory:adjust"); actionLabel(actor, label) },
  levels: grant("inventory:read"), reportLevels: grant("reports:read"), catalogueLevels: grant("products:read"), movements: grant("inventory:read"),
}
function cartAssignment(actor: Actor, customerId: string | null) {
  if (trusted(actor) || actor.kind === "customer" && (!customerId || customerId === actor.id) || actor.kind === "anonymous" && customerId === null) return
  throw new DomainError("forbidden", "You don't have access to this account.")
}
export const cartGuards: FixtureGuards<CartOperations> = {
  findByTokenHash: store, findById: publicRead,
  findActiveByCustomer(actor, storeId, customerId) { store(actor, storeId); requireCustomerOwner(actor, customerId) },
  create(actor, cart) { store(actor, cart.storeId); cartAssignment(actor, cart.customerId); if (actor.kind === "anonymous" && actor.cartTokenHash !== cart.tokenHash && (cart.lines.length || cart.promotionCodes.length || cart.status !== "active")) throw new DomainError("forbidden", "A verified cart capability is required.") },
  save(actor, cart) { store(actor, cart.storeId); cartAssignment(actor, cart.customerId); const current = fixtureCartOwner(actor, cart.id); if (current.tokenHash !== cart.tokenHash || current.status !== "active") throw new DomainError("conflict", "This cart is no longer active.") },
  merge(actor, guestId, targetId) { if (actor.kind !== "customer" && !trusted(actor)) throw new DomainError("forbidden", "Sign in to merge your bag."); fixtureCartOwner(actor, guestId); fixtureCartOwner(actor, targetId) },
  purgeAbandoned: jobGrant, listAbandoned: storeGrant("marketing:read"),
}
function shopper(actor: Actor, context: { customerId: string | null; email: string | null }) {
  if (trusted(actor) || actor.kind === "customer" && context.customerId === actor.id && (!context.email || context.email.toLowerCase() === actor.email) || actor.kind === "anonymous" && !context.customerId && (!context.email || context.email.toLowerCase() === actor.checkoutEmail)) return
  throw new DomainError("forbidden", "You don't have access to this shopper.")
}
export const promotionGuards: FixtureGuards<PromotionOperations> = {
  listActive: store,
  redemptionsFor(actor, storeId, context) { store(actor, storeId); shopper(actor, context) },
  orderCountFor(actor, storeId, context) { store(actor, storeId); shopper(actor, context) },
  listAll: storeGrant("promotions:read"), find: storeGrant("promotions:read"),
  save(actor, promotion) { storeGrant("promotions:write")(actor, promotion.storeId) },
  remove: storeGrant("promotions:write"), redemptions: grant("promotions:read"),
}

export const catalogProjections: FixtureProjections<CatalogOperations> = { getProductsByVariantIds: (_actor, rows) => rows.filter((row) => row.status === "active") }
const cartVisible = (actor: Actor, row: Awaited<ReturnType<CartOperations["findById"]>>) => {
  if (!row) return null
  if (trusted(actor) || actor.kind === "staff" && actor.permissions.includes("orders:write") || actor.kind === "customer" && row.customerId === actor.id || (actor.kind === "anonymous" || actor.kind === "customer") && row.customerId === null && actor.cartTokenHash === row.tokenHash) return row
  return null
}
export const cartProjections: FixtureProjections<CartOperations> = { findById: cartVisible, findByTokenHash: cartVisible }
export const promotionProjections: FixtureProjections<PromotionOperations> = { redemptions: (actor, rows) => rows.map((row) => ({ ...row, email: actor.permissions.includes("customers:read_pii") ? row.email : "***" })) }
