import "server-only"
import { mysqlPolicy } from "@/server/db/policy.repository"

import { and, asc, count, desc, eq, getTableColumns, gt, inArray } from "drizzle-orm"
import type { CatalogOperations } from "./repository"
import type { AttributeDefinition, AttributeValue, Collection, CustomFieldDefinition, Product } from "./types"
import { type Actor, type ActorScoped, requireGrant, requireStore, requireSystem } from "@/server/db/actor"
import { database, type Database, withTransaction } from "@/server/db/client"
import { attributeDefinitions, brands, collectionProducts, collections, customFieldDefinitions, inventoryLevels, orderLines, productAttributeValues, productImages, products, productTags, stores, variantAttributeValues, variants } from "@/server/db/schema"
import { uuidv7 } from "@/server/db/uuid"
import { isoDate, jsonValue, sqlDate } from "@/server/db/values"
import { DomainError } from "@/server/shared/errors"
import { removeCatalogueSearch, syncCatalogueSearch } from "@/server/search/catalogue-index.repository"
import { syncCatalogueListing } from "./listing-index.repository"
import { bumpCatalogueRevision } from "./facet-cache.repository"
import { staffProductScope } from "./staff-search.repository"

export async function hydrateProducts(db: Database, actor: Actor, rows: (typeof products.$inferSelect)[]): Promise<Product[]> {
  if (!rows.length) return []
  for (const row of rows) requireStore(actor, row.storeId)
  const ids = rows.map((row) => row.id)
  const [brandRows, imageRows, variantRows, tagRows, links] = await Promise.all([
    db.select({ id: brands.id, slug: brands.slug, name: brands.name, position: brands.position }).from(brands).where(and(eq(brands.storeId, actor.storeId), inArray(brands.id, [...new Set(rows.map((row) => row.brandId))]))),
    db.select().from(productImages).where(inArray(productImages.productId, ids)).orderBy(asc(productImages.position)),
    db.select().from(variants).where(inArray(variants.productId, ids)).orderBy(asc(variants.position)),
    db.select().from(productTags).where(inArray(productTags.id, ids)).orderBy(asc(productTags.position)),
    db.select({ productId: collectionProducts.productId, slug: collections.slug }).from(collectionProducts).innerJoin(collections, eq(collections.id, collectionProducts.collectionId)).where(and(inArray(collectionProducts.productId, ids), eq(collections.storeId, actor.storeId))).orderBy(asc(collectionProducts.productPosition)),
  ])
  const brandMap = new Map(brandRows.map((row) => [row.id, row]))
  return rows.map((row): Product => {
    const brand = brandMap.get(row.brandId)
    if (!brand) throw new DomainError("unavailable", "A product's brand configuration is missing.")
    return {
      id: row.id, storeId: row.storeId, slug: row.slug, title: row.title, brand,
      kind: row.kind as Product["kind"], gender: row.gender as Product["gender"], status: row.status as Product["status"], description: row.description,
      condition: row.conditionGrade as Product["condition"], conditionNotes: row.conditionNotes,
      images: imageRows.filter((image) => image.productId === row.id).map((image) => ({ url: image.url, alt: image.alt, width: image.width, height: image.height, role: image.role as "card" | "gallery" })),
      variants: variantRows.filter((variant) => variant.productId === row.id).map((variant) => ({ id: variant.id, sku: variant.sku, size: { eu: variant.sizeEu, uk: variant.sizeUk, us: variant.sizeUs, cm: variant.sizeCm }, attributes: jsonValue<Product["attributes"]>(variant.attributes), weightGrams: variant.weightGrams, position: variant.position })),
      attributes: jsonValue<Product["attributes"]>(row.attributes), customFields: jsonValue<Product["customFields"]>(row.customFields),
      collections: links.filter((link) => link.productId === row.id).map((link) => link.slug), tags: tagRows.filter((tag) => tag.id === row.id).map((tag) => tag.value),
      position: row.position, publishedAt: isoDate(row.publishedAt), seo: jsonValue<Product["seo"]>(row.seo), updatedAt: isoDate(row.updatedAt),
    }
  })
}

function collection(row: typeof collections.$inferSelect): Collection {
  return { ...row, kind: row.kind as Collection["kind"], headline: jsonValue<Collection["headline"]>(row.headline), rules: jsonValue<Collection["rules"]>(row.rules ?? []), image: jsonValue<Collection["image"]>(row.image), seo: jsonValue<Collection["seo"]>(row.seo) }
}

function attributes(values: Record<string, AttributeValue>) {
  return Object.entries(values).flatMap(([attributeKey, value]) => [...new Set(Array.isArray(value) ? value : [value])].map((item) => ({ attributeKey, valueText: String(item), valueNum: typeof item === "number" && Number.isFinite(item) ? String(item) : null })))
}

/** Cursor-bounded maintenance rebuild. It never saves products or changes their timestamps. */
export async function reindexCatalogueSearch(actor: Actor, cursor: string | null = null, limit = 500): Promise<{ count: number; cursor: string | null }> {
  requireSystem(actor, ["migration"])
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new DomainError("validation", "Invalid reindex batch size.")
  return withTransaction(async (db) => {
    await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
    const rows = await db.select().from(products).where(and(eq(products.storeId, actor.storeId), cursor ? gt(products.id, cursor) : undefined)).orderBy(asc(products.id)).limit(limit).for("update")
    for (const product of await hydrateProducts(db, actor, rows)) await syncCatalogueSearch(db, product)
    await syncCatalogueListing(db, actor, rows.map((row) => row.id))
    return { count: rows.length, cursor: rows.at(-1)?.id ?? null }
  })
}

export function createMysqlCatalogRepository(): ActorScoped<CatalogOperations> {
  return mysqlPolicy<CatalogOperations>({
    async listProducts(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      return hydrateProducts(db, actor, await db.select().from(products).where(and(eq(products.storeId, actor.storeId), eq(products.status, "active"))).orderBy(asc(products.position)))
    },
    async getProductBySlug(actor, storeId, slug) {
      requireStore(actor, storeId)
      const db = await database()
      const rows = await db.select().from(products).where(and(eq(products.storeId, actor.storeId), eq(products.slug, slug), eq(products.status, "active"))).limit(1)
      return (await hydrateProducts(db, actor, rows))[0] ?? null
    },
    async getProductsByVariantIds(actor, variantIds) {
      if (!variantIds.length) return []
      const db = await database()
      const rows = await db.selectDistinct(getTableColumns(products)).from(products).innerJoin(variants, eq(variants.productId, products.id)).where(and(eq(products.storeId, actor.storeId), eq(products.status, "active"), inArray(variants.id, variantIds)))
      return hydrateProducts(db, actor, rows)
    },
    async listCollections(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      return (await db.select().from(collections).where(eq(collections.storeId, actor.storeId)).orderBy(asc(collections.position))).map(collection)
    },
    async listBrands(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      return db.select({ id: brands.id, slug: brands.slug, name: brands.name, position: brands.position }).from(brands).where(eq(brands.storeId, actor.storeId)).orderBy(asc(brands.position))
    },
    async listAttributeDefinitions(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      return (await db.select().from(attributeDefinitions).where(eq(attributeDefinitions.storeId, actor.storeId)).orderBy(asc(attributeDefinitions.position))).map((row): AttributeDefinition => ({ code: row.code, label: row.label, type: row.type as AttributeDefinition["type"], scope: row.scope as AttributeDefinition["scope"], ...(row.options ? { options: jsonValue<AttributeDefinition["options"]>(row.options) } : {}), filterable: row.filterable === 1, position: row.position }))
    },
    async listCustomFieldDefinitions(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      return (await db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.storeId, actor.storeId))).map((row): CustomFieldDefinition => ({ entity: row.entity as CustomFieldDefinition["entity"], code: row.code, label: row.label, type: row.type as CustomFieldDefinition["type"], required: row.required === 1, visibleOnStorefront: row.visibleOnStorefront === 1 }))
    },
    async upsertProducts(actor, storeId, incoming) {
      requireStore(actor, storeId); requireGrant(actor, "products:import")
      return withTransaction(async (db) => {
        await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
        for (const product of incoming) {
          const [current] = await db.select({ id: products.id }).from(products).where(and(eq(products.storeId, actor.storeId), eq(products.slug, product.slug))).for("update")
          await this.saveProduct(actor, storeId, { ...product, id: current?.id ?? product.id }, null)
        }
        return incoming.length
      })
    },
    async reportProducts(actor, storeId, page) {
      requireStore(actor, storeId); requireGrant(actor, "reports:read")
      if (!Number.isSafeInteger(page) || page < 1) throw new DomainError("validation", "Invalid page.")
      const db = await database()
      const rows = await db.select().from(products).where(eq(products.storeId, actor.storeId)).orderBy(asc(products.id)).limit(1000).offset((page - 1) * 1000)
      return hydrateProducts(db, actor, rows)
    },
    async searchProducts(actor, storeId, query) {
      requireStore(actor, storeId); requireGrant(actor, "products:read")
      const db = await database()
      const where = staffProductScope(db, actor.storeId, query)
      const [rows, [total]] = await Promise.all([db.select().from(products).where(where).orderBy(desc(products.updatedAt), asc(products.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize), db.select({ count: count() }).from(products).where(where)])
      return { products: await hydrateProducts(db, actor, rows), total: total.count }
    },
    async getProductById(actor, storeId, id) {
      requireStore(actor, storeId); requireGrant(actor, "products:read")
      const db = await database()
      return (await hydrateProducts(db, actor, await db.select().from(products).where(and(eq(products.storeId, actor.storeId), eq(products.id, id))).limit(1)))[0] ?? null
    },
    async saveProduct(actor, storeId, product, expectedUpdatedAt) {
      requireStore(actor, storeId); requireStore(actor, product.storeId); requireGrant(actor, "products:write")
      return withTransaction(async (db) => {
        await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
        const where = and(eq(products.storeId, actor.storeId), eq(products.id, product.id))
        const [current] = await db.select().from(products).where(where).for("update")
        if (current && expectedUpdatedAt !== null && isoDate(current.updatedAt) !== expectedUpdatedAt) throw new DomainError("conflict", "Someone else saved this product since you opened it. Reload to see their changes.")
        if ((!current && product.status === "active") || current && current.status !== product.status) requireGrant(actor, "products:publish")
        const [brand] = await db.select({ id: brands.id }).from(brands).where(and(eq(brands.id, product.brand.id), eq(brands.storeId, actor.storeId)))
        if (!brand) throw new DomainError("not_found", "Brand not found.")
        const existingVariants = current ? await db.select({ id: variants.id }).from(variants).where(eq(variants.productId, current.id)).orderBy(asc(variants.id)).for("update") : []
        const removed = existingVariants.filter((variant) => !product.variants.some((next) => next.id === variant.id)).map((variant) => variant.id)
        if (removed.length) {
          const [ordered] = await db.select({ id: orderLines.id }).from(orderLines).where(inArray(orderLines.variantId, removed)).limit(1)
          if (ordered) throw new DomainError("conflict", "A size that has been ordered can't be removed. Archive the product instead.")
          await db.delete(variants).where(and(eq(variants.productId, product.id), inArray(variants.id, removed)))
        }
        const updatedAt = new Date(Math.max(Date.now(), current ? Date.parse(isoDate(current.updatedAt)) + 1 : 0)).toISOString()
        const values = { slug: product.slug.trim().toLowerCase(), title: product.title, brandId: product.brand.id, kind: product.kind, gender: product.gender, status: product.status, description: product.description, conditionGrade: product.condition, conditionNotes: product.conditionNotes, attributes: product.attributes, customFields: product.customFields, position: product.position, publishedAt: sqlDate(product.publishedAt), seo: product.seo, updatedAt: sqlDate(updatedAt) }
        if (current) await db.update(products).set(values).where(where)
        else await db.insert(products).values({ id: product.id, storeId, ...values })
        await db.delete(productImages).where(eq(productImages.productId, product.id))
        if (product.images.length) await db.insert(productImages).values(product.images.map((image, position) => ({ ...image, role: image.role ?? "gallery", id: uuidv7(), productId: product.id, position })))
        for (const variant of [...product.variants].sort((a, b) => a.id.localeCompare(b.id))) {
          const values = { sku: variant.sku, sizeEu: variant.size.eu, sizeUk: variant.size.uk, sizeUs: variant.size.us, sizeCm: variant.size.cm, attributes: variant.attributes, weightGrams: variant.weightGrams, position: variant.position }
          if (existingVariants.some((row) => row.id === variant.id)) await db.update(variants).set(values).where(and(eq(variants.id, variant.id), eq(variants.productId, product.id)))
          else { await db.insert(variants).values({ id: variant.id, productId: product.id, ...values }); await db.insert(inventoryLevels).values({ variantId: variant.id, onHand: 0, reserved: 0 }) }
          await db.delete(variantAttributeValues).where(eq(variantAttributeValues.variantId, variant.id))
          const projected = attributes(variant.attributes)
          if (projected.length) await db.insert(variantAttributeValues).values(projected.map((item) => ({ variantId: variant.id, ...item })))
        }
        await db.delete(productTags).where(eq(productTags.id, product.id))
        if (product.tags.length) await db.insert(productTags).values(product.tags.map((value, position) => ({ id: product.id, value, position })))
        await db.delete(productAttributeValues).where(eq(productAttributeValues.productId, product.id))
        const projected = attributes(product.attributes)
        if (projected.length) await db.insert(productAttributeValues).values(projected.map((item) => ({ productId: product.id, ...item })))
        const previousLinks = await db.select().from(collectionProducts).where(eq(collectionProducts.productId, product.id))
        await db.delete(collectionProducts).where(eq(collectionProducts.productId, product.id))
        if (product.collections.length) {
          const selected = await db.select({ id: collections.id, slug: collections.slug }).from(collections).where(and(eq(collections.storeId, actor.storeId), inArray(collections.slug, product.collections)))
          if (selected.length !== new Set(product.collections).size) throw new DomainError("validation", "One of the collections no longer exists.")
          await db.insert(collectionProducts).values(product.collections.map((slug, productPosition) => {
            const row = selected.find((collection) => collection.slug === slug)!
            return { productId: product.id, collectionId: row.id, productPosition, position: previousLinks.find((link) => link.collectionId === row.id)?.position ?? product.position }
          }))
        }
        const saved = (await hydrateProducts(db, actor, await db.select().from(products).where(where)))[0]
        await syncCatalogueSearch(db, saved)
        await syncCatalogueListing(db, actor, [saved.id])
        return saved
      })
    },
    async deleteProduct(actor, storeId, id) {
      requireStore(actor, storeId); requireGrant(actor, "products:delete")
      await withTransaction(async (db) => {
        await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
        const [row] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, id), eq(products.storeId, actor.storeId))).for("update")
        if (!row) throw new DomainError("not_found", "Product not found.")
        const [ordered] = await db.select({ id: orderLines.id }).from(orderLines).where(eq(orderLines.productId, id)).limit(1)
        if (ordered) throw new DomainError("conflict", "This product has been ordered, so it can't be deleted. Archive it instead.")
        await removeCatalogueSearch(db, actor.storeId, id)
        await db.delete(products).where(and(eq(products.id, id), eq(products.storeId, actor.storeId)))
        await bumpCatalogueRevision(db, actor)
      })
    },
    async saveCollection(actor, storeId, input, productIds) {
      requireStore(actor, storeId); requireStore(actor, input.storeId); requireGrant(actor, "collections:write")
      return withTransaction(async (db) => {
        await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
        const where = and(eq(collections.storeId, actor.storeId), eq(collections.id, input.id))
        const [row] = await db.select({ id: collections.id }).from(collections).where(where).for("update")
        const { id, storeId: _store, ...values } = input
        if (row) await db.update(collections).set(values).where(where)
        else await db.insert(collections).values({ ...values, id, storeId })
        if (input.kind === "rule" || productIds !== null) {
          await db.delete(collectionProducts).where(eq(collectionProducts.collectionId, id))
          if (input.kind === "manual" && productIds?.length) {
            const found = await db.select({ id: products.id }).from(products).where(and(eq(products.storeId, actor.storeId), inArray(products.id, productIds)))
            if (found.length !== new Set(productIds).size) throw new DomainError("validation", "One of the selected products no longer exists.")
            const memberships = await db.select({ productId: collectionProducts.productId, position: collectionProducts.productPosition }).from(collectionProducts).where(inArray(collectionProducts.productId, productIds))
            await db.insert(collectionProducts).values(productIds.map((productId, position) => ({ collectionId: id, productId, position, productPosition: Math.max(-1, ...memberships.filter((link) => link.productId === productId).map((link) => link.position)) + 1 })))
          }
        }
        await bumpCatalogueRevision(db, actor)
        return collection((await db.select().from(collections).where(where))[0])
      })
    },
    async deleteCollection(actor, storeId, id) {
      requireStore(actor, storeId); requireGrant(actor, "collections:write")
      await withTransaction(async (db) => {
        await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
        const [result] = await db.delete(collections).where(and(eq(collections.storeId, actor.storeId), eq(collections.id, id)))
        if (!result.affectedRows) throw new DomainError("not_found", "Collection not found.")
        await bumpCatalogueRevision(db, actor)
      })
    },
    async collectionProductIds(actor, storeId, collectionId) {
      requireStore(actor, storeId); requireGrant(actor, "collections:read")
      const db = await database()
      return (await db.select({ id: collectionProducts.productId }).from(collectionProducts).innerJoin(collections, eq(collections.id, collectionProducts.collectionId)).innerJoin(products, eq(products.id, collectionProducts.productId)).where(and(eq(collections.storeId, actor.storeId), eq(products.storeId, actor.storeId), eq(collections.id, collectionId))).orderBy(asc(collectionProducts.position))).map((row) => row.id)
    },
    async createBrand(actor, storeId, brand) {
      requireStore(actor, storeId); requireGrant(actor, "products:write")
      const db = await database()
      await db.insert(brands).values({ ...brand, slug: brand.slug.trim().toLowerCase(), storeId })
      return structuredClone(brand)
    },
  })
}
