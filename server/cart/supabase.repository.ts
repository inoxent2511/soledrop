import "server-only"

import type { CartRepository } from "@/server/cart/repository"
import type { CartRow } from "@/server/cart/types"
import { supabase, unwrap } from "@/server/db/supabase"

const CART_SELECT = "id, store_id, token_hash, customer_id, currency, promotion_codes, status, created_at, updated_at, cart_lines(id, variant_id, quantity, added_at)"

type CartRecord = {
  id: string
  store_id: string
  token_hash: string
  customer_id: string | null
  currency: CartRow["currency"]
  promotion_codes: string[]
  status: CartRow["status"]
  created_at: string
  updated_at: string
  cart_lines: { id: string; variant_id: string; quantity: number; added_at: string }[]
}

function toCart(record: CartRecord): CartRow {
  return {
    id: record.id,
    storeId: record.store_id,
    tokenHash: record.token_hash,
    customerId: record.customer_id,
    currency: record.currency,
    promotionCodes: record.promotion_codes,
    status: record.status,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    lines: [...record.cart_lines]
      .sort((a, b) => a.added_at.localeCompare(b.added_at))
      .map((line) => ({ id: line.id, variantId: line.variant_id, quantity: line.quantity, addedAt: line.added_at })),
  }
}

export function createSupabaseCartRepository(): CartRepository {
  return {
    async findByTokenHash(storeId, tokenHash) {
      const row = unwrap(
        await supabase().from("carts").select(CART_SELECT).eq("store_id", storeId).eq("token_hash", tokenHash).eq("status", "active").maybeSingle(),
      ) as CartRecord | null
      return row ? toCart(row) : null
    },
    async findById(id) {
      const row = unwrap(await supabase().from("carts").select(CART_SELECT).eq("id", id).maybeSingle()) as CartRecord | null
      return row ? toCart(row) : null
    },
    async findActiveByCustomer(storeId, customerId) {
      const row = unwrap(
        await supabase()
          .from("carts")
          .select(CART_SELECT)
          .eq("store_id", storeId)
          .eq("customer_id", customerId)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ) as CartRecord | null
      return row ? toCart(row) : null
    },
    async create(cart) {
      unwrap(
        await supabase().from("carts").insert({
          id: cart.id,
          store_id: cart.storeId,
          token_hash: cart.tokenHash,
          customer_id: cart.customerId,
          currency: cart.currency,
          promotion_codes: cart.promotionCodes,
          status: cart.status,
        }),
      )
      return cart
    },
    async save(cart) {
      unwrap(
        await supabase().rpc("save_cart", {
          p_cart_id: cart.id,
          p_customer_id: cart.customerId,
          p_promotion_codes: cart.promotionCodes,
          p_lines: cart.lines.map((line) => ({ id: line.id, variant_id: line.variantId, quantity: line.quantity, added_at: line.addedAt })),
        }),
      )
      return (await this.findById(cart.id)) as CartRow
    },
    async merge(guestCartId, customerCartId) {
      unwrap(await supabase().rpc("merge_carts", { p_guest_cart_id: guestCartId, p_customer_cart_id: customerCartId }))
      return (await this.findById(customerCartId)) as CartRow
    },
    async purgeAbandoned(olderThanDays) {
      return unwrap(await supabase().rpc("purge_abandoned_carts", { p_older_than_days: olderThanDays })) as number
    },
    async listAbandoned(storeId, query) {
      const cutoff = new Date(Date.now() - query.olderThanHours * 3_600_000).toISOString()
      const start = (query.page - 1) * query.pageSize
      const result = await supabase()
        .from("carts")
        .select(`${CART_SELECT}, has_lines:cart_lines!inner(id)`, { count: "exact" })
        .eq("store_id", storeId)
        .eq("status", "active")
        .lt("updated_at", cutoff)
        .order("updated_at", { ascending: false })
        .range(start, start + query.pageSize - 1)
      const rows = unwrap(result) as unknown as CartRecord[]
      return { carts: rows.map(toCart), total: result.count ?? rows.length }
    },
  }
}
