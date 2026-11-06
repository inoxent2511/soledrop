import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { cart, freshDatabase, ids, level, placeOrder, seed, STORE } from "./harness"

/**
 * Every commerce RPC, each with a contention case: many calls fired at once against one scarce
 * resource. PGlite runs them one transaction at a time, so these prove each RPC keeps its
 * invariants under interleaving; parallel-connection lock timing needs a Postgres server
 * (blocked here: no Docker — see qa/defects.md).
 */
let db: PGlite

beforeEach(async () => {
  db = await freshDatabase()
  await seed(db)
})

afterEach(async () => {
  await db.close()
})

const scalar = async <T>(sql: string, params: unknown[] = []) => {
  const { rows } = await db.query<{ value: T }>(sql, params)
  return rows[0].value
}

const raised = async (sql: string, params: unknown[] = []) => {
  try {
    await db.query(sql, params)
    return null
  } catch (error) {
    return (error as Error).message
  }
}

describe("next_order_number", () => {
  it("hands out gap-free unique numbers under contention", async () => {
    const numbers = await Promise.all(Array.from({ length: 25 }, () => scalar<string>(`select public.next_order_number($1) as value`, [STORE])))
    expect(new Set(numbers).size).toBe(25)
    expect([...numbers].sort()).toEqual(Array.from({ length: 25 }, (_, index) => `SD${10001 + index}`))
  })

  it("rejects an unknown store", async () => {
    expect(await raised(`select public.next_order_number('nope')`)).toBe("not_found: Unknown store.")
  })
})

describe("reserve_stock", () => {
  it("releases one cart's holds idempotently with an empty replacement, preserving another cart's stock", async () => {
    const first = await cart(db, [])
    const second = await cart(db, [])
    for (const [id, quantity] of [[first, 2], [second, 1]] as const) {
      await db.query(`select public.reserve_stock($1, $2::jsonb, 15)`, [id, JSON.stringify([{ variant_id: ids.variantA, quantity }])])
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      await db.query(`select public.reserve_stock($1, '[]'::jsonb, 15)`, [first])
      expect(await level(db, ids.variantA)).toEqual({ on_hand: 3, reserved: 1 })
    }
    expect(await scalar<number>(`select count(*)::int as value from public.inventory_reservations where cart_id = $1`, [first])).toBe(0)
    expect(await scalar<number>(`select quantity as value from public.inventory_reservations where cart_id = $1`, [second])).toBe(1)
  })

  it("never holds more than is on hand when carts race for the last units", async () => {
    const carts = await Promise.all(Array.from({ length: 6 }, () => cart(db, [])))
    const results = await Promise.all(
      carts.map((id) => raised(`select public.reserve_stock($1, $2::jsonb, 15)`, [id, JSON.stringify([{ variant_id: ids.variantA, quantity: 1 }])])),
    )
    expect(results.filter((message) => message === null)).toHaveLength(3)
    expect(results.filter((message) => message?.startsWith("out_of_stock:"))).toHaveLength(3)
    expect(await level(db, ids.variantA)).toEqual({ on_hand: 3, reserved: 3 })
  })

  it("replaces a cart's own holds instead of stacking them", async () => {
    const id = await cart(db, [])
    for (const quantity of [2, 3, 1]) {
      await db.query(`select public.reserve_stock($1, $2::jsonb, 15)`, [id, JSON.stringify([{ variant_id: ids.variantA, quantity }])])
    }
    expect(await level(db, ids.variantA)).toEqual({ on_hand: 3, reserved: 1 })
    expect(await scalar<number>(`select count(*)::int as value from public.inventory_reservations where cart_id = $1`, [id])).toBe(1)
  })

  it("is all or nothing across lines", async () => {
    const id = await cart(db, [])
    const message = await raised(`select public.reserve_stock($1, $2::jsonb, 15)`, [
      id,
      JSON.stringify([{ variant_id: ids.variantA, quantity: 1 }, { variant_id: ids.variantB, quantity: 2 }]),
    ])
    expect(message).toMatch(/^out_of_stock:/)
    expect(await level(db, ids.variantA)).toEqual({ on_hand: 3, reserved: 0 })
  })

  it("reports availability with the cart's own holds counted as free for that cart", async () => {
    const id = await cart(db, [])
    await db.query(`select public.reserve_stock($1, $2::jsonb, 15)`, [id, JSON.stringify([{ variant_id: ids.variantA, quantity: 2 }])])
    const { rows } = await db.query<{ variant_id: string; available: number }>(`select * from public.stock_availability($1::uuid[], $2)`, [[ids.variantA], id])
    expect(rows[0].available).toBe(3)
    const { rows: others } = await db.query<{ available: number }>(`select * from public.stock_availability($1::uuid[], null)`, [[ids.variantA]])
    expect(others[0].available).toBe(1)
  })
})

describe("release_expired_reservations", () => {
  it("returns expired holds exactly once when run concurrently", async () => {
    const id = await cart(db, [])
    await db.query(`select public.reserve_stock($1, $2::jsonb, 15)`, [id, JSON.stringify([{ variant_id: ids.variantA, quantity: 2 }])])
    await db.exec(`update public.inventory_reservations set expires_at = now() - interval '1 minute'`)
    const released = await Promise.all(Array.from({ length: 4 }, () => scalar<number>(`select public.release_expired_reservations() as value`)))
    expect(released.reduce((sum, count) => sum + count, 0)).toBe(1)
    expect(await level(db, ids.variantA)).toEqual({ on_hand: 3, reserved: 0 })
  })
})

describe("place_order", () => {
  it("sells the last pair exactly once when many shoppers check out at once", async () => {
    const carts = await Promise.all(Array.from({ length: 8 }, () => cart(db, [{ variantId: ids.variantB, quantity: 1 }])))
    const results = await Promise.all(carts.map((id, index) => placeOrder(db, id, `key-${index}`, [{ variantId: ids.variantB, quantity: 1 }])))
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    for (const failure of results.filter((result) => !result.ok)) {
      expect(failure.message).toBe("out_of_stock: ASICS Gel-Kayano 14 (EU 45) is no longer available in that quantity.")
    }
    expect(await level(db, ids.variantB)).toEqual({ on_hand: 0, reserved: 0 })
    expect(await scalar<number>(`select count(*)::int as value from public.orders`)).toBe(1)
  })

  it("replays a repeated idempotency key instead of charging twice", async () => {
    const id = await cart(db, [{ variantId: ids.variantA, quantity: 1 }])
    const results = await Promise.all(Array.from({ length: 5 }, () => placeOrder(db, id, "same-key", [{ variantId: ids.variantA, quantity: 1 }])))
    const orderIds = new Set(results.map((result) => (result.ok ? result.order_id : result.message)))
    expect(orderIds.size).toBe(1)
    expect(results.filter((result) => result.ok && !result.replayed)).toHaveLength(1)
    expect(await level(db, ids.variantA)).toEqual({ on_hand: 2, reserved: 0 })
  })

  it("converts the cart, uses the cart's own holds, numbers the order and queues the event", async () => {
    const id = await cart(db, [{ variantId: ids.variantA, quantity: 3 }])
    await db.query(`select public.reserve_stock($1, $2::jsonb, 15)`, [id, JSON.stringify([{ variant_id: ids.variantA, quantity: 3 }])])
    const result = await placeOrder(db, id, "k1", [{ variantId: ids.variantA, quantity: 3 }])
    expect(result.ok).toBe(true)
    expect(await level(db, ids.variantA)).toEqual({ on_hand: 0, reserved: 0 })
    expect(await scalar<string>(`select status::text as value from public.carts where id = $1`, [id])).toBe("converted")
    expect(await scalar<string>(`select number as value from public.orders`)).toBe("SD10001")
    expect(await scalar<string>(`select payload ->> 'number' as value from public.outbox_events where topic = 'order.placed'`)).toBe("SD10001")
    expect(await scalar<number>(`select jsonb_array_length(history) as value from public.orders`)).toBe(1)

    const again = await placeOrder(db, id, "k2", [{ variantId: ids.variantA, quantity: 1 }])
    expect(again).toEqual({ ok: false, message: "conflict: This bag has already been checked out." })
  })

  it("does not sell stock another cart is holding", async () => {
    const holder = await cart(db, [])
    await db.query(`select public.reserve_stock($1, $2::jsonb, 15)`, [holder, JSON.stringify([{ variant_id: ids.variantA, quantity: 3 }])])
    const buyer = await cart(db, [{ variantId: ids.variantA, quantity: 1 }])
    const result = await placeOrder(db, buyer, "k1", [{ variantId: ids.variantA, quantity: 1 }])
    expect(result.ok).toBe(false)
    await db.exec(`update public.inventory_reservations set expires_at = now() - interval '1 second'`)
    expect((await placeOrder(db, buyer, "k2", [{ variantId: ids.variantA, quantity: 1 }])).ok).toBe(true)
  })

  it("rolls everything back when a promotion fails", async () => {
    await db.exec(`update public.promotions set active = false where id = '${ids.promotionLimited}'`)
    const id = await cart(db, [{ variantId: ids.variantA, quantity: 1 }])
    const result = await placeOrder(db, id, "k1", [{ variantId: ids.variantA, quantity: 1 }], [ids.promotionLimited])
    expect(result).toEqual({ ok: false, message: "promotion_invalid: A discount on your bag is no longer available." })
    expect(await level(db, ids.variantA)).toEqual({ on_hand: 3, reserved: 0 })
    expect(await scalar<string>(`select status::text as value from public.carts where id = $1`, [id])).toBe("active")
    expect(await scalar<string>(`select next_order_number::text as value from public.stores`)).toBe("10001")
  })
})

describe("redeem_promotion", () => {
  it("never exceeds a usage limit under contention", async () => {
    const carts = await Promise.all(Array.from({ length: 3 }, () => cart(db, [{ variantId: ids.variantA, quantity: 1 }])))
    const results = await Promise.all(
      carts.map((id, index) => placeOrder(db, id, `k-${index}`, [{ variantId: ids.variantA, quantity: 1 }], [ids.promotionLimited], `shopper${index}@example.com`)),
    )
    expect(results.filter((result) => result.ok)).toHaveLength(2)
    expect(results.find((result) => !result.ok)).toEqual({ ok: false, message: 'promotion_invalid: "Rs. 500 off" has been fully redeemed.' })
    expect(await scalar<number>(`select times_used as value from public.promotions where id = $1`, [ids.promotionLimited])).toBe(2)
  })

  it("enforces once per shopper by email, case-insensitively", async () => {
    const first = await cart(db, [{ variantId: ids.variantA, quantity: 1 }])
    const second = await cart(db, [{ variantId: ids.variantA, quantity: 1 }])
    const results = await Promise.all([
      placeOrder(db, first, "k1", [{ variantId: ids.variantA, quantity: 1 }], [ids.promotionOncePerShopper], "Ayesha@Example.com"),
      placeOrder(db, second, "k2", [{ variantId: ids.variantA, quantity: 1 }], [ids.promotionOncePerShopper], "ayesha@example.com"),
    ])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.find((result) => !result.ok)).toEqual({ ok: false, message: 'promotion_invalid: You have already used "10% off your first order".' })
    const { rows } = await db.query<{ promotion_id: string; redemptions: number }>(`select * from public.promotion_redemption_counts($1, null, 'AYESHA@example.com')`, [STORE])
    expect(rows).toEqual([{ promotion_id: ids.promotionOncePerShopper, redemptions: 1 }])
    expect(await scalar<number>(`select public.shopper_order_count($1, null, 'ayesha@EXAMPLE.com') as value`, [STORE])).toBe(1)
  })
})

describe("merge_carts", () => {
  it("merges a guest bag once, capped by stock and 10 per line", async () => {
    const guest = await cart(db, [{ variantId: ids.variantA, quantity: 2 }, { variantId: ids.variantB, quantity: 1 }])
    const mine = await cart(db, [{ variantId: ids.variantA, quantity: 2 }])
    await db.exec(`update public.carts set promotion_codes = '{WELCOME10}' where id = '${guest}'`)
    await db.query(`select public.reserve_stock($1, $2::jsonb, 15)`, [guest, JSON.stringify([{ variant_id: ids.variantA, quantity: 1 }])])
    const results = await Promise.all([1, 2, 3].map(() => raised(`select public.merge_carts($1, $2)`, [guest, mine])))
    expect(results.every((message) => message === null)).toBe(true)
    const { rows } = await db.query<{ variant_id: string; quantity: number }>(`select variant_id, quantity from public.cart_lines where cart_id = $1 order by variant_id`, [mine])
    expect(rows).toEqual([
      { variant_id: ids.variantA, quantity: 3 },
      { variant_id: ids.variantB, quantity: 1 },
    ])
    expect(await scalar<string>(`select status::text as value from public.carts where id = $1`, [guest])).toBe("merged")
    expect(await scalar<string[]>(`select promotion_codes as value from public.carts where id = $1`, [mine])).toEqual(["WELCOME10"])
    expect(await level(db, ids.variantA)).toEqual({ on_hand: 3, reserved: 0 })
  })
})

describe("transition_order", () => {
  const placed = async () => {
    const id = await cart(db, [{ variantId: ids.variantA, quantity: 2 }])
    const result = await placeOrder(db, id, "k1", [{ variantId: ids.variantA, quantity: 2 }])
    if (!result.ok) throw new Error(result.message)
    return result.order_id
  }

  it("lets exactly one of two racing transitions win and restocks a cancellation once", async () => {
    const order = await placed()
    const results = await Promise.all([
      raised(`select public.transition_order($1, 'cancelled', 'customer', null, null)`, [order]),
      raised(`select public.transition_order($1, 'cancelled', 'staff:owner', null, null)`, [order]),
      raised(`select public.transition_order($1, 'processing', 'staff:owner', null, null)`, [order]),
    ])
    expect(results.filter((message) => message === null)).toHaveLength(1)
    expect(results.filter((message) => message?.startsWith("invalid_transition:"))).toHaveLength(2)
    expect(await level(db, ids.variantA)).toEqual({ on_hand: 3, reserved: 0 })
    expect(await scalar<number>(`select count(*)::int as value from public.audit_log where action = 'order.transition'`)).toBe(1)
  })

  it("walks the happy path and refuses to skip a step", async () => {
    const order = await placed()
    expect(await raised(`select public.transition_order($1, 'shipped', 'staff', null, null)`, [order])).toBe("invalid_transition: An order that is confirmed can't become shipped.")
    for (const to of ["processing", "shipped", "delivered"]) {
      expect(await raised(`select public.transition_order($1, $2, 'staff', null, $3)`, [order, to, to === "shipped" ? "TRK123" : null])).toBeNull()
    }
    const { rows } = await db.query<{ status: string; fulfillment_status: string; tracking_number: string; steps: number }>(
      `select status, fulfillment_status, tracking_number, jsonb_array_length(history) as steps from public.orders where id = $1`,
      [order],
    )
    expect(rows[0]).toEqual({ status: "delivered", fulfillment_status: "fulfilled", tracking_number: "TRK123", steps: 4 })
    expect(await level(db, ids.variantA)).toEqual({ on_hand: 1, reserved: 0 })
    expect(await raised(`select public.transition_order($1, 'cancelled', 'staff', null, null)`, [order])).toBe("invalid_transition: An order that is delivered can't become cancelled.")
  })
})

describe("record_payment", () => {
  it("records a replayed webhook once and confirms a pending order when paid in full", async () => {
    const id = await cart(db, [{ variantId: ids.variantA, quantity: 1 }])
    const result = await placeOrder(db, id, "k1", [{ variantId: ids.variantA, quantity: 1 }])
    if (!result.ok) throw new Error(result.message)
    await db.exec(`update public.orders set status = 'pending_payment' where id = '${result.order_id}'`)
    const call = `select (public.record_payment($1, 'bank_transfer', 'captured', 1499900, 'PKR', 'TXN-1', 'evt-1')).id as value`
    const paymentIds = await Promise.all(Array.from({ length: 4 }, () => scalar<string>(call, [result.order_id])))
    expect(new Set(paymentIds).size).toBe(1)
    const { rows } = await db.query<{ status: string; payment_status: string }>(`select status, payment_status from public.orders where id = $1`, [result.order_id])
    expect(rows[0]).toEqual({ status: "confirmed", payment_status: "paid" })
    expect(await scalar<number>(`select count(*)::int as value from public.payments`)).toBe(1)
    expect(await scalar<number>(`select count(*)::int as value from public.outbox_events where topic = 'order.status_changed'`)).toBe(1)
  })
})

describe("create_refund and restock_return", () => {
  const paidOrder = async () => {
    const id = await cart(db, [{ variantId: ids.variantA, quantity: 2 }])
    const result = await placeOrder(db, id, "k1", [{ variantId: ids.variantA, quantity: 2 }])
    if (!result.ok) throw new Error(result.message)
    const payment = await scalar<string>(`select (public.record_payment($1, 'cod', 'captured', 2999800, 'PKR', null, 'cod-1')).id as value`, [result.order_id])
    const line = await scalar<string>(`select id as value from public.order_lines where order_id = $1`, [result.order_id])
    return { order: result.order_id, payment, line }
  }

  it("never refunds more than was paid, even with concurrent requests", async () => {
    const { order, payment, line } = await paidOrder()
    const refund = (key: string) =>
      raised(`select public.create_refund($1, $2, 1499900, 'Changed mind', $3::jsonb, true, $4)`, [order, payment, JSON.stringify([{ order_line_id: line, quantity: 1 }]), key])
    const results = await Promise.all([refund("r1"), refund("r2"), refund("r3"), refund("r1")])
    expect(results.filter((message) => message === null)).toHaveLength(3)
    expect(results.filter((message) => message !== null)).toHaveLength(1)
    const { rows } = await db.query<{ refunded_total: string; payment_status: string }>(`select refunded_total::text, payment_status from public.orders where id = $1`, [order])
    expect(rows[0]).toEqual({ refunded_total: "2999800", payment_status: "refunded" })
    expect(await scalar<number>(`select count(*)::int as value from public.refunds`)).toBe(2)
    expect(await level(db, ids.variantA)).toEqual({ on_hand: 3, reserved: 0 })
  })

  it("restocks a received return exactly once", async () => {
    const { order, line } = await paidOrder()
    for (const to of ["processing", "shipped", "delivered"]) await db.query(`select public.transition_order($1, $2, 'staff', null, null)`, [order, to])
    const returnId = await scalar<string>(`select (public.create_return($1, $2::jsonb, 'Too small')).id as value`, [order, JSON.stringify([{ order_line_id: line, quantity: 2 }])])
    expect(await raised(`select public.create_return($1, $2::jsonb, 'Again')`, [order, JSON.stringify([{ order_line_id: line, quantity: 1 }])])).toBe("conflict: A return is already open for this order.")
    await Promise.all([1, 2, 3].map(() => db.query(`select public.restock_return($1, 'staff:owner')`, [returnId])))
    expect(await level(db, ids.variantA)).toEqual({ on_hand: 3, reserved: 0 })
    expect(await scalar<string>(`select status::text as value from public.returns where id = $1`, [returnId])).toBe("received")
    expect(await scalar<number>(`select count(*)::int as value from public.audit_log where action = 'return.restock'`)).toBe(1)
  })
})

describe("adjust_stock", () => {
  it("never lets on-hand go negative or below what is held", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => raised(`select public.adjust_stock($1, -1, 'damaged', 'staff')`, [ids.variantA])))
    expect(results.filter((message) => message === null)).toHaveLength(3)
    expect(await level(db, ids.variantB)).toEqual({ on_hand: 1, reserved: 0 })
    const holder = await cart(db, [])
    await db.query(`select public.reserve_stock($1, $2::jsonb, 15)`, [holder, JSON.stringify([{ variant_id: ids.variantB, quantity: 1 }])])
    expect(await raised(`select public.adjust_stock($1, -1, 'damaged', 'staff')`, [ids.variantB])).toMatch(/inventory_reserved_within_on_hand/)
  })
})

describe("platform RPCs", () => {
  it("claims each outbox event for one worker only", async () => {
    await db.exec(`insert into public.outbox_events (store_id, topic, payload) select '${STORE}', 'order.placed', '{}' from generate_series(1, 5)`)
    const claims = await Promise.all([3, 3, 3].map((limit) => db.query<{ id: string }>(`select id from public.claim_outbox_events($1)`, [limit])))
    const claimed = claims.flatMap((claim) => claim.rows.map((row) => row.id))
    expect(claimed).toHaveLength(5)
    expect(new Set(claimed).size).toBe(5)
    await db.query(`select public.fail_outbox_event($1, 'timeout', 1)`, [claimed[0]])
    expect(await scalar<string>(`select status::text as value from public.outbox_events where id = $1`, [claimed[0]])).toBe("failed")
  })

  it("counts rate-limit hits in a fixed window", async () => {
    const counts = await Promise.all(Array.from({ length: 6 }, () => scalar<number>(`select public.rate_limit_hit('checkout:1.2.3.4', 60) as value`)))
    expect([...counts].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("subscribes an address once", async () => {
    const results = await Promise.all([1, 2, 3].map(() => scalar<boolean>(`select public.subscribe_newsletter($1, 'Sana@Example.com', 'footer') as value`, [STORE])))
    expect(results.filter(Boolean)).toHaveLength(1)
  })
})

describe("customers", () => {
  it("keeps exactly one default address", async () => {
    const customer = await scalar<string>(`insert into public.customers (store_id, email, password_hash, full_name) values ($1, 'bilal@example.com', 'x', 'Bilal') returning id as value`, [STORE])
    const address = (isDefault: boolean) =>
      JSON.stringify({ full_name: "Bilal", phone: "0300", line1: "Street", city: "Lahore", province: "Punjab", country: "PK", is_default: isDefault })
    const first = await scalar<string>(`select (public.save_address($1, $2::jsonb)).id as value`, [customer, address(false)])
    const second = await scalar<string>(`select (public.save_address($1, $2::jsonb)).id as value`, [customer, address(true)])
    expect(await scalar<string>(`select id as value from public.addresses where is_default`)).toBe(second)
    await db.query(`select public.delete_address($1, $2)`, [customer, second])
    expect(await scalar<string>(`select id as value from public.addresses where is_default`)).toBe(first)
    await db.query(`select public.scrub_customer($1)`, [customer])
    expect(await scalar<number>(`select count(*)::int as value from public.addresses`)).toBe(0)
    expect(await scalar<string>(`select full_name as value from public.customers where id = $1`, [customer])).toBe("Deleted customer")
  })
})

describe("import_products", () => {
  it("upserts by slug and is idempotent", async () => {
    const product = {
      id: "20000000-0000-4000-8000-0000000000aa",
      slug: "nike-pegasus",
      title: "Nike Pegasus 41",
      brand: { id: "10000000-0000-4000-8000-0000000000aa", slug: "nike", name: "Nike", position: 1 },
      kind: "preloved",
      gender: "men",
      status: "active",
      description: "",
      condition: "excellent",
      conditionNotes: "Light creasing",
      images: [{ url: "/a.webp", alt: "Side", width: 800, height: 800, role: "card" }],
      variants: [{ id: "30000000-0000-4000-8000-0000000000aa", sku: "PEG-42", size: { eu: "42", uk: "8", us: "9", cm: "27" }, attributes: {}, weightGrams: 900, position: 0 }],
      attributes: {},
      customFields: {},
      collections: [],
      tags: [],
      position: 0,
      publishedAt: "2026-11-01T00:00:00Z",
      seo: {},
    }
    for (let run = 0; run < 2; run += 1) {
      expect(await scalar<number>(`select public.import_products($1, $2::jsonb) as value`, [STORE, JSON.stringify([{ ...product, title: `Nike Pegasus 41 v${run}` }])])).toBe(1)
    }
    expect(await scalar<string>(`select title as value from public.products where slug = 'nike-pegasus'`)).toBe("Nike Pegasus 41 v1")
    expect(await scalar<number>(`select count(*)::int as value from public.product_images where product_id = $1`, [product.id])).toBe(1)
    expect(await level(db, product.variants[0].id)).toEqual({ on_hand: 0, reserved: 0 })
    expect(await raised(`select public.import_products($1, $2::jsonb)`, [STORE, JSON.stringify([{ ...product, slug: "bad", condition: null }])])).toMatch(/products_check/)
  })
})
