import "server-only"
import { fixturePolicy } from "@/server/db/fixtures-policy.repository"
import { catalogGuards, catalogProjections } from "@/server/db/fixture-guards.repository"

import type { CatalogOperations, CatalogRepository } from "@/server/catalog/repository"
import type { AdminProductQuery, Product } from "@/server/catalog/types"
import { db, transaction } from "@/server/fixtures/store"
import { DomainError } from "@/server/shared/errors"

function matchesAdmin(product: Product, query: AdminProductQuery): boolean {
  const q = query.q?.trim().toLowerCase()
  if (q && ![product.title, product.slug, product.brand.name, ...product.variants.map((variant) => variant.sku)].some((value) => value.toLowerCase().includes(q))) return false
  if (query.status?.length && !query.status.includes(product.status)) return false
  if (query.kind && product.kind !== query.kind) return false
  if (query.brandId && product.brand.id !== query.brandId) return false
  return true
}

export function createFixturesCatalogRepository(): CatalogRepository {
  const operations: CatalogOperations = {
    async listProducts(storeId) {
      return db().products.filter((product) => product.storeId === storeId && product.status === "active")
    },
    async getProductBySlug(storeId, slug) {
      return db().products.find((product) => product.storeId === storeId && product.slug === slug && product.status === "active") ?? null
    },
    async getProductsByVariantIds(variantIds) {
      const wanted = new Set(variantIds)
      return db().products.filter((product) => product.variants.some((variant) => wanted.has(variant.id)))
    },
    async listCollections(storeId) {
      return db().collections.filter((collection) => collection.storeId === storeId).sort((a, b) => a.position - b.position)
    },
    async listBrands() {
      return [...db().brands].sort((a, b) => a.position - b.position)
    },
    async listAttributeDefinitions() {
      return db().attributeDefinitions
    },
    async listCustomFieldDefinitions() {
      return db().customFieldDefinitions
    },
    async upsertProducts(storeId, incoming) {
      return transaction((tables) => {
        for (const product of incoming) {
          const index = tables.products.findIndex((existing) => existing.storeId === storeId && existing.slug === product.slug)
          if (index === -1) tables.products.push({ ...product, storeId })
          else tables.products[index] = { ...product, id: tables.products[index].id, storeId }
          for (const variant of product.variants) {
            if (!tables.inventory.some((row) => row.variantId === variant.id)) tables.inventory.push({ variantId: variant.id, onHand: 0, reserved: 0 })
          }
        }
        return incoming.length
      })
    },

    async reportProducts(storeId, page) {
      if (!Number.isSafeInteger(page) || page < 1) throw new DomainError("validation", "Invalid page.")
      return db().products.filter((row) => row.storeId === storeId).sort((a, b) => a.id.localeCompare(b.id)).slice((page - 1) * 1000, page * 1000)
    },
    async searchProducts(storeId, query) {
      const found = db()
        .products.filter((product) => product.storeId === storeId && matchesAdmin(product, query))
        .sort((a, b) => (b.updatedAt ?? b.publishedAt).localeCompare(a.updatedAt ?? a.publishedAt))
      const start = (query.page - 1) * query.pageSize
      return { products: structuredClone(found.slice(start, start + query.pageSize)), total: found.length }
    },
    async getProductById(storeId, id) {
      return structuredClone(db().products.find((product) => product.storeId === storeId && product.id === id) ?? null)
    },
    async saveProduct(storeId, product, expectedUpdatedAt) {
      return transaction((tables) => {
        const index = tables.products.findIndex((row) => row.storeId === storeId && row.id === product.id)
        const current = index === -1 ? null : tables.products[index]
        if (current && expectedUpdatedAt !== null && (current.updatedAt ?? current.publishedAt) !== expectedUpdatedAt) {
          throw new DomainError("conflict", "Someone else saved this product since you opened it. Reload to see their changes.")
        }
        if (tables.products.some((row) => row.storeId === storeId && row.slug === product.slug && row.id !== product.id)) {
          throw new DomainError("conflict", "Another product already uses this web address (slug).")
        }
        const skus = new Set(tables.products.filter((row) => row.id !== product.id).flatMap((row) => row.variants.map((variant) => variant.sku)))
        const clash = product.variants.find((variant) => skus.has(variant.sku))
        if (clash) throw new DomainError("conflict", `SKU ${clash.sku} is already used by another product.`)
        const removed = (current?.variants ?? []).filter((variant) => !product.variants.some((next) => next.id === variant.id))
        if (removed.some((variant) => tables.orders.some((order) => order.lines.some((line) => line.variantId === variant.id)))) {
          throw new DomainError("conflict", "A size that has been ordered can't be removed. Archive the product instead.")
        }
        const saved: Product = { ...structuredClone(product), storeId, updatedAt: new Date(Math.max(Date.now(), Date.parse(current?.updatedAt ?? current?.publishedAt ?? "1970-01-01") + 1)).toISOString() }
        if (index === -1) tables.products.push(saved)
        else tables.products[index] = saved
        const gone = new Set(removed.map((variant) => variant.id))
        tables.inventory = tables.inventory.filter((row) => !gone.has(row.variantId))
        tables.prices = tables.prices.filter((row) => !gone.has(row.variantId))
        for (const variant of product.variants) {
          if (!tables.inventory.some((row) => row.variantId === variant.id)) tables.inventory.push({ variantId: variant.id, onHand: 0, reserved: 0 })
        }
        return structuredClone(saved)
      })
    },
    async deleteProduct(storeId, id) {
      transaction((tables) => {
        const product = tables.products.find((row) => row.storeId === storeId && row.id === id)
        if (!product) throw new DomainError("not_found", "Product not found.")
        const variantIds = new Set(product.variants.map((variant) => variant.id))
        if (tables.orders.some((order) => order.lines.some((line) => variantIds.has(line.variantId)))) {
          throw new DomainError("conflict", "This product has been ordered, so it can't be deleted. Archive it instead.")
        }
        tables.products = tables.products.filter((row) => row !== product)
        tables.inventory = tables.inventory.filter((row) => !variantIds.has(row.variantId))
        tables.prices = tables.prices.filter((row) => !variantIds.has(row.variantId))
      })
    },
    async saveCollection(storeId, collection, productIds) {
      return transaction((tables) => {
        const index = tables.collections.findIndex((row) => row.storeId === storeId && row.id === collection.id)
        if (tables.collections.some((row) => row.storeId === storeId && row.slug === collection.slug && row.id !== collection.id)) {
          throw new DomainError("conflict", "Another collection already uses this web address (slug).")
        }
        const previousSlug = index === -1 ? collection.slug : tables.collections[index].slug
        const saved = { ...structuredClone(collection), storeId }
        if (index === -1) tables.collections.push(saved)
        else tables.collections[index] = saved
        // Membership lives on the product (its collection slugs); rule collections keep none.
        for (const product of tables.products.filter((row) => row.storeId === storeId)) {
          const was = product.collections.includes(previousSlug)
          const keep = product.collections.filter((slug) => slug !== previousSlug && slug !== collection.slug)
          const member = collection.kind === "manual" && (productIds ? productIds.includes(product.id) : was)
          product.collections = member ? [...keep, collection.slug] : keep
        }
        return structuredClone(saved)
      })
    },
    async deleteCollection(storeId, id) {
      transaction((tables) => {
        const collection = tables.collections.find((row) => row.storeId === storeId && row.id === id)
        if (!collection) throw new DomainError("not_found", "Collection not found.")
        tables.collections = tables.collections.filter((row) => row !== collection)
        for (const product of tables.products) product.collections = product.collections.filter((slug) => slug !== collection.slug)
      })
    },
    async collectionProductIds(storeId, collectionId) {
      const tables = db()
      const collection = tables.collections.find((row) => row.storeId === storeId && row.id === collectionId)
      return collection ? tables.products.filter((product) => product.storeId === storeId && product.collections.includes(collection.slug)).map((product) => product.id) : []
    },
    async createBrand(_storeId, brand) {
      return transaction((tables) => {
        if (tables.brands.some((row) => row.slug === brand.slug)) throw new DomainError("conflict", "That brand already exists.")
        tables.brands.push(structuredClone(brand))
        return structuredClone(brand)
      })
    },
    async deleteBrand(storeId, id) {
      transaction((tables) => {
        const brand = tables.brands.find((row) => row.id === id)
        if (!brand) throw new DomainError("not_found", "Brand not found.")
        if (tables.products.some((row) => row.storeId === storeId && row.brand.id === id)) throw new DomainError("conflict", "This brand is used by products. Change those products to another brand first.")
        tables.brands = tables.brands.filter((row) => row.id !== id)
      })
    },
  }
  return fixturePolicy<CatalogOperations>(operations, catalogGuards, catalogProjections)
}
