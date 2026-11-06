import fs from "node:fs"
import path from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { emptyHome } from "@/server/content/home-types"

import { as, cart, freshDatabase, ids, placeOrder, seed, STORE } from "./harness"

describe("homepage SQL and empty merchant bootstrap", () => {
  let db: Awaited<ReturnType<typeof freshDatabase>>
  const storeId = "00000000-0000-4000-8000-000000000001"
  beforeAll(async () => {
    db = await freshDatabase()
    await db.exec(fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/seed.sql"), "utf8"))
  })
  afterAll(async () => { await db?.close() })

  it("bootstraps no sample products or promotions, with a usable base price list", async () => {
    const result = await db.query<{ products: number; promotions: number; price_lists: number }>("select (select count(*)::int from public.products) products, (select count(*)::int from public.promotions) promotions, (select count(*)::int from public.price_lists) price_lists")
    expect(result.rows[0]).toEqual({ products: 0, promotions: 0, price_lists: 1 })
    expect((await db.query<{ rates: Record<string, number> }>("select rates from public.exchange_rates where store_id=$1", [storeId])).rows[0].rates).toEqual({ PKR: 1 })
    expect((await db.query<{ n: number }>("select count(*)::int n from public.feature_flags where store_id=$1 and not enabled", [storeId])).rows[0].n).toBe(4)
  })

  it("saves through service_role and rejects stale or simultaneous first saves", async () => {
    await as(db, "service_role", null, async () => {
      await db.query("select public.save_home($1, $2, null)", [storeId, JSON.stringify(emptyHome)])
      await expect(db.query("select public.save_home($1, $2, null)", [storeId, JSON.stringify(emptyHome)])).rejects.toThrow(/conflict/)
      const current = (await db.query<{ updated_at: string }>("select updated_at from public.storefront_content where store_id=$1", [storeId])).rows[0].updated_at
      await db.query("select public.save_home($1, $2, $3)", [storeId, JSON.stringify({ ...emptyHome, announcement: "New drop" }), current])
      expect((await db.query<{ announcement: string }>("select content->>'announcement' announcement from public.storefront_content where store_id=$1", [storeId])).rows[0].announcement).toBe("New drop")
    })
  })

  it("blocks anonymous direct reads and writes", async () => {
    await expect(as(db, "anon", null, () => db.query("select * from public.storefront_content"))).rejects.toThrow(/permission denied/)
    await expect(as(db, "authenticated", null, () => db.query("select public.save_home($1, $2, null)", [storeId, JSON.stringify(emptyHome)]))).rejects.toThrow(/permission denied/)
  })

  it("finds purchased image usage only within the owning store", async () => {
    const history = await freshDatabase()
    try {
      await seed(history)
      const basket = await cart(history, [{ variantId: ids.variantA, quantity: 1 }])
      expect((await placeOrder(history, basket, "media-history", [{ variantId: ids.variantA, quantity: 1 }])).ok).toBe(true)
      await as(history, "service_role", null, async () => {
        const used = async (store: string, url: string) => (await history.query<{ used: boolean }>("select public.media_has_order_usage($1,$2) used", [store, url])).rows[0].used
        expect(await used(STORE, "/images/products/asics.webp")).toBe(true)
        expect(await used("another-store", "/images/products/asics.webp")).toBe(false)
        expect(await used(STORE, "/media/not-used.webp")).toBe(false)
      })
      await expect(as(history, "anon", null, () => history.query("select public.media_has_order_usage($1,$2)", [STORE, "/images/products/asics.webp"]))).rejects.toThrow(/permission denied/)
    } finally { await history.close() }
  })
})
