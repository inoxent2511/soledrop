import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { as, cart, freshDatabase, ids, placeOrder, seed, STORE } from "./harness"

let db: PGlite

beforeAll(async () => {
  db = await freshDatabase()
  await seed(db)
  const id = await cart(db, [{ variantId: ids.variantA, quantity: 1 }])
  await placeOrder(db, id, "k1", [{ variantId: ids.variantA, quantity: 1 }])
  await db.exec(`insert into public.customers (store_id, email, password_hash, full_name) values ('${STORE}', 'bilal@example.com', 'scrypt$secret', 'Bilal')`)
  await db.exec(`insert into public.pages (store_id, slug, title, published) values ('${STORE}', 'about', 'About', true), ('${STORE}', 'draft', 'Draft', false)`)
})

afterAll(async () => {
  await db.close()
})

const count = async (table: string) => {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`)
  return rows[0].n
}

const attempt = async (sql: string) => {
  try {
    const result = await db.query(sql)
    return { ok: true as const, affected: result.affectedRows ?? 0 }
  } catch (error) {
    return { ok: false as const, message: (error as Error).message }
  }
}

describe("row level security", () => {
  it("is enabled on every table in public", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class as c join pg_namespace as n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    )
    expect(rows).toEqual([])
  })

  it("lets shoppers read only the published catalogue and content", async () => {
    await as(db, "anon", null, async () => {
      expect(await count("products")).toBe(1)
      expect(await count("variants")).toBe(2)
      expect(await count("pages")).toBe(1)
    })
  })

  it("denies anonymous access to everything private", async () => {
    await as(db, "anon", null, async () => {
      for (const table of ["orders", "order_lines", "customers", "addresses", "sessions", "carts", "cart_lines", "payments", "audit_log", "outbox_events", "promotions", "inventory_levels", "staff_members", "idempotency_keys", "rate_limits"]) {
        const result = await attempt(`select * from public.${table}`)
        expect(result, table).toMatchObject({ ok: false })
      }
      expect(await attempt(`update public.products set title = 'pwned'`)).toMatchObject({ ok: false })
      expect(await attempt(`insert into public.orders (store_id) values ('${STORE}')`)).toMatchObject({ ok: false })
    })
  })

  it("denies the RPCs to anon and authenticated", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await as(db, role, ids.owner, async () => {
        expect(await attempt(`select public.next_order_number('${STORE}')`)).toMatchObject({ ok: false, message: expect.stringMatching(/permission denied/) })
        expect(await attempt(`select public.adjust_stock('${ids.variantA}', 100, 'x', 'x')`)).toMatchObject({ ok: false })
      })
    }
  })

  it("gives a signed-in user with no staff role nothing beyond the storefront", async () => {
    await as(db, "authenticated", ids.stranger, async () => {
      expect(await count("orders")).toBe(0)
      expect(await count("customers")).toBe(0)
      expect(await count("staff_members")).toBe(0)
      expect(await attempt(`update public.products set title = 'x'`)).toEqual({ ok: true, affected: 0 })
      expect(await attempt(`insert into public.staff_members (user_id, store_id, role) values ('${ids.stranger}', '${STORE}', 'owner')`)).toMatchObject({ ok: false })
    })
  })

  it("scopes staff by role", async () => {
    await as(db, "authenticated", ids.support, async () => {
      expect(await count("orders")).toBe(1)
      expect(await count("customers")).toBe(1)
      expect(await count("audit_log")).toBe(0)
      expect(await attempt(`update public.products set title = 'x'`)).toEqual({ ok: true, affected: 0 })
      expect(await attempt(`update public.orders set total = 0`)).toMatchObject({ ok: false })
    })
    await as(db, "authenticated", ids.owner, async () => {
      expect(await count("products")).toBe(2)
      expect(await attempt(`update public.products set title = 'ASICS Gel-Kayano 14 GS' where slug = 'asics-gel-kayano'`)).toEqual({ ok: true, affected: 1 })
      expect(await count("staff_members")).toBe(2)
    })
  })

  it("keeps the audit log append-only, even for the service role", async () => {
    await db.exec(`insert into public.audit_log (actor, action, entity, entity_id) values ('test', 'x', 'order', '1')`)
    expect(await attempt(`delete from public.audit_log`)).toMatchObject({ ok: false, message: "audit_log is append-only" })
    expect(await attempt(`update public.audit_log set actor = 'someone else'`)).toMatchObject({ ok: false })
  })

  it("pins search_path on every function and keeps SECURITY DEFINER to the role and permission lookups", async () => {
    const { rows } = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(
      `select p.proname, p.prosecdef, p.proconfig from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace where n.nspname = 'public'`,
    )
    expect(rows.filter((row) => !row.proconfig?.includes('search_path=""'))).toEqual([])
    expect(rows.filter((row) => row.prosecdef).map((row) => row.proname).sort()).toEqual(["has_permission", "has_staff_role", "staff_role"])
  })
})
