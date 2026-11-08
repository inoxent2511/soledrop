import "server-only"
import { mysqlPolicy } from "@/server/db/policy.repository"

import { and, count, desc, eq, like, or } from "drizzle-orm"
import type { MediaOperations } from "./repository"
import type { MediaItem } from "./types"
import { mediaUrl } from "./types"
import { type ActorScoped, requireGrant, requireStore } from "@/server/db/actor"
import { database, withTransaction } from "@/server/db/client"
import { media, orderLines, orders, productImages, products, collections, storefrontContent } from "@/server/db/schema"
import { escapeLike, isoDate, jsonValue, sqlDate } from "@/server/db/values"
import { storage } from "@/server/adapters/storage"
import { digest } from "@/server/adapters/storage/local-disk"
import { lockStore } from "@/server/inventory/mysql.repository"
import type { HomeContent } from "@/server/content/home-types"
import type { Collection } from "@/server/catalog/types"
import { DomainError } from "@/server/shared/errors"
import { variantKey, writeImageVariants } from "./variants"

function item(row: typeof media.$inferSelect): MediaItem { return { ...row, mime: row.mime as MediaItem["mime"], createdAt: isoDate(row.createdAt) } }

export function createMysqlMediaRepository(): ActorScoped<MediaOperations> {
  return mysqlPolicy<MediaOperations>({
    async list(actor, storeId, query) {
      requireStore(actor, storeId); requireGrant(actor, "media:read")
      const db = await database()
      const term = query.q ? "%" + escapeLike(query.q.trim()) + "%" : null
      const where = and(eq(media.storeId, actor.storeId), term ? or(like(media.filename, term), like(media.alt, term)) : undefined)
      const [rows, [total]] = await Promise.all([db.select().from(media).where(where).orderBy(desc(media.createdAt), media.id).limit(query.pageSize).offset((query.page - 1) * query.pageSize), db.select({ count: count() }).from(media).where(where)])
      return { items: rows.map(item), total: total.count }
    },
    async find(actor, storeId, id) {
      requireStore(actor, storeId); requireGrant(actor, "media:read")
      const db = await database()
      const [row] = await db.select().from(media).where(and(eq(media.storeId, actor.storeId), eq(media.id, id))).limit(1)
      return row ? item(row) : null
    },
    async findById(actor, id) {
      const db = await database()
      const [row] = await db.select().from(media).where(and(eq(media.storeId, actor.storeId), eq(media.id, id))).limit(1)
      return row ? item(row) : null
    },
    async create(actor, input, data) {
      requireStore(actor, input.storeId); requireGrant(actor, "media:write")
      if (actor.kind === "staff" && input.createdBy !== actor.id) throw new DomainError("forbidden", "Upload identity does not match the actor.")
      const saved = { ...input, path: input.storeId + "/" + input.id + "/" + digest(data) + ".webp" }
      await storage().put(saved.path, data)
      await writeImageVariants(saved.path, data, (key, bytes) => storage().put(key, bytes))
      const db = await database()
      await db.insert(media).values({ ...saved, createdAt: sqlDate(saved.createdAt) })
      return saved
    },
    async updateAlt(actor, storeId, id, alt) {
      requireStore(actor, storeId); requireGrant(actor, "media:write")
      return withTransaction(async (db) => {
        const where = and(eq(media.storeId, actor.storeId), eq(media.id, id))
        const [row] = await db.select().from(media).where(where).for("update")
        if (!row) throw new DomainError("not_found", "Image not found.")
        await db.update(media).set({ alt }).where(where)
        return item({ ...row, alt })
      })
    },
    async remove(actor, storeId, id) {
      requireStore(actor, storeId); requireGrant(actor, "media:write")
      await withTransaction(async (db) => {
        await lockStore(db, actor)
        const where = and(eq(media.storeId, actor.storeId), eq(media.id, id))
        const [row] = await db.select().from(media).where(where).for("update")
        if (!row) throw new DomainError("not_found", "Image not found.")
        const url = mediaUrl(row)
        const [productUsage] = await db.select({ id: productImages.id }).from(productImages).innerJoin(products, eq(products.id, productImages.productId)).where(and(eq(products.storeId, actor.storeId), eq(productImages.url, url))).limit(1)
        const [orderUsage] = await db.select({ id: orderLines.id }).from(orderLines).innerJoin(orders, eq(orders.id, orderLines.orderId)).where(and(eq(orders.storeId, actor.storeId), eq(orderLines.imageUrl, url))).limit(1)
        const banners = await db.select({ image: collections.image }).from(collections).where(eq(collections.storeId, actor.storeId))
        const [homeRow] = await db.select({ content: storefrontContent.content }).from(storefrontContent).where(eq(storefrontContent.storeId, actor.storeId))
        const home = homeRow ? jsonValue<HomeContent>(homeRow.content) : null
        const bannerUsage = banners.some((banner) => jsonValue<Collection["image"]>(banner.image)?.url === url) || home && [...home.slides, ...home.instagram.images, ...home.categories.map((category) => category.image)].some((image) => image.src === url)
        if (productUsage || orderUsage || bannerUsage) throw new DomainError("conflict", "This image is in use. Replace it on the relevant products or pages first. Images in order history must be kept.")
        await db.delete(media).where(where)
        // Immutable bytes stay available for backup/rollback until offline orphan cleanup.
      })
    },
    async read(actor, path) {
      const db = await database()
      const [row] = await db.select({ path: media.path }).from(media).where(and(eq(media.storeId, actor.storeId), eq(media.path, path))).limit(1)
      return row ? (await storage().get(row.path))?.data ?? null : null
    },
    async readVariant(actor, path, width, format) {
      const key = variantKey(path, width, format), db = await database()
      const [row] = await db.select({ path: media.path }).from(media).where(and(eq(media.storeId, actor.storeId), eq(media.path, path))).limit(1)
      return row ? (await storage().get(key))?.data ?? null : null
    },
    async hasOrderUsage(actor, storeId, url) {
      requireStore(actor, storeId); requireGrant(actor, "media:read")
      const db = await database()
      const [row] = await db.select({ id: orderLines.id }).from(orderLines).innerJoin(orders, eq(orders.id, orderLines.orderId)).where(and(eq(orders.storeId, actor.storeId), eq(orderLines.imageUrl, url))).limit(1)
      return Boolean(row)
    },
  })
}
