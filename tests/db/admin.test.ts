import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { as, freshDatabase, seed, STORE } from "./harness"

/** Admin foundation (migration 20261107090000): RBAC, has_permission, last Owner, RPCs, RLS. */

let db: PGlite

const owner = "a1000000-0000-4000-8000-000000000001"
const second = "a1000000-0000-4000-8000-000000000002"
const support = "a1000000-0000-4000-8000-000000000003"
const suspended = "a1000000-0000-4000-8000-000000000004"

const PERMISSIONS = [
  { key: "orders:read", label: "View orders", group: "orders", sensitive: false },
  { key: "orders:refund", label: "Refund", group: "orders", sensitive: true },
  { key: "staff:read", label: "View staff", group: "staff", sensitive: false },
  { key: "staff:manage", label: "Manage staff", group: "staff", sensitive: true },
  { key: "audit:read", label: "Audit", group: "staff", sensitive: false },
]
const ROLES = [
  { key: "owner", name: "Owner", description: "Everything", refund_limit: null, permissions: PERMISSIONS.map((p) => p.key) },
  { key: "support_agent", name: "Support agent", description: "Orders", refund_limit: 500000, permissions: ["orders:read"] },
]

const attempt = async (sql: string) => {
  try {
    // exec runs several statements (a transaction); query returns rows for a single one.
    const result = sql.includes(";") ? { rows: [] } : await db.query(sql)
    if (sql.includes(";")) await db.exec(sql)
    return { ok: true as const, rows: result.rows }
  } catch (error) {
    if (sql.includes(";")) await db.exec("rollback")
    return { ok: false as const, message: (error as Error).message }
  }
}

const member = (userId: string, email: string, status = "active") =>
  `insert into public.staff_members (user_id, store_id, email, display_name, status) values ('${userId}', '${STORE}', '${email}', '${email}', '${status}')`

beforeAll(async () => {
  db = await freshDatabase()
  await seed(db)
  await db.query(`select public.sync_admin_registry($1, $2::jsonb, $3::jsonb)`, [STORE, JSON.stringify(PERMISSIONS), JSON.stringify(ROLES)])
  await db.exec(member(owner, "owner@example.com"))
  await db.exec(member(second, "second@example.com"))
  await db.exec(member(support, "support@example.com"))
  await db.exec(member(suspended, "gone@example.com", "suspended"))
  await db.exec(`select public.set_staff_roles('${STORE}', '${owner}', array['owner'])`)
  await db.exec(`select public.set_staff_roles('${STORE}', '${support}', array['support_agent'])`)
  await db.exec(`select public.set_staff_roles('${STORE}', '${suspended}', array['owner'])`)
})

afterAll(async () => {
  await db.close()
})

const hasPermission = (userId: string, permission: string) =>
  as(db, "authenticated", userId, async () => (await db.query<{ ok: boolean }>(`select public.has_permission('${STORE}', '${permission}') as ok`)).rows[0].ok)

describe("admin foundation", () => {
  it("syncs the registry idempotently and keeps custom roles", async () => {
    await db.exec(`select public.save_role('${STORE}', 'custom_one', 'Custom', '', null, array['orders:read'], null, true)`)
    await db.query(`select public.sync_admin_registry($1, $2::jsonb, $3::jsonb)`, [STORE, JSON.stringify(PERMISSIONS), JSON.stringify(ROLES)])
    const { rows } = await db.query<{ key: string; is_system: boolean; n: number }>(
      `select r.key, r.is_system, count(rp.permission)::int as n from public.roles r left join public.role_permissions rp on rp.role_id = r.id group by r.key, r.is_system order by r.key`,
    )
    expect(rows).toEqual([
      { key: "custom_one", is_system: false, n: 1 },
      { key: "owner", is_system: true, n: 5 },
      { key: "support_agent", is_system: true, n: 1 },
    ])
  })

  it("resolves permissions through roles, and only for active members", async () => {
    expect(await hasPermission(owner, "orders:refund")).toBe(true)
    expect(await hasPermission(support, "orders:read")).toBe(true)
    expect(await hasPermission(support, "orders:refund")).toBe(false)
    expect(await hasPermission(suspended, "orders:read")).toBe(false)
    expect(await hasPermission(second, "orders:read")).toBe(false)
  })

  it("lets staff:read see roles and keeps sessions server-only", async () => {
    await as(db, "authenticated", owner, async () => {
      expect((await attempt(`select key from public.roles`)).rows?.length).toBe(3)
      expect(await attempt(`select * from public.staff_sessions`)).toMatchObject({ ok: false })
    })
    await as(db, "authenticated", support, async () => {
      expect((await attempt(`select key from public.roles`)).rows).toEqual([])
      expect((await attempt(`select * from public.staff_invites`)).rows).toEqual([])
      expect(await attempt(`insert into public.staff_invites (store_id, email, role_key, token_hash, expires_at) values ('${STORE}', 'x@example.com', 'owner', 'h', now())`)).toMatchObject({ ok: false })
    })
  })

  it("denies the admin RPCs to anon and authenticated", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await as(db, role, owner, async () => {
        expect(await attempt(`select public.set_staff_roles('${STORE}', '${support}', array['owner'])`)).toMatchObject({ ok: false, message: expect.stringMatching(/permission denied/) })
        expect(await attempt(`select public.delete_role('${STORE}', 'custom_one')`)).toMatchObject({ ok: false })
        expect(await attempt(`select public.sync_admin_registry('${STORE}', '[]', '[]')`)).toMatchObject({ ok: false })
      })
    }
  })

  it("refuses to leave the store without an active Owner", async () => {
    expect(await attempt(`select public.set_staff_roles('${STORE}', '${owner}', array['support_agent'])`)).toMatchObject({
      ok: false,
      message: "conflict: The store must keep at least one active Owner.",
    })
    expect(await attempt(`update public.staff_members set status = 'suspended' where user_id = '${owner}'`)).toMatchObject({ ok: false })
    expect(await attempt(`delete from public.staff_members where user_id = '${owner}'`)).toMatchObject({ ok: false })
    // A hand-over in one transaction is fine.
    expect(
      await attempt(`begin; select public.set_staff_roles('${STORE}', '${second}', array['owner']); select public.set_staff_roles('${STORE}', '${owner}', array['support_agent']); commit;`),
    ).toMatchObject({ ok: true })
    const { rows } = await db.query<{ n: number }>(`select public.active_owner_count('${STORE}') as n`)
    expect(rows[0].n).toBe(1)
  })

  it("guards roles: unknown keys, Owner edits, system deletes, roles in use, stale writes", async () => {
    expect(await attempt(`select public.set_staff_roles('${STORE}', '${support}', array['nope'])`)).toMatchObject({ ok: false, message: "validation: Unknown role." })
    expect(await attempt(`select public.save_role('${STORE}', 'owner', 'Boss', '', null, array['orders:read'], null, false)`)).toMatchObject({ ok: false, message: expect.stringMatching(/^forbidden:/) })
    expect(await attempt(`select public.delete_role('${STORE}', 'support_agent')`)).toMatchObject({ ok: false, message: expect.stringMatching(/^forbidden:/) })
    await db.exec(`select public.set_staff_roles('${STORE}', '${support}', array['support_agent', 'custom_one'])`)
    expect(await attempt(`select public.delete_role('${STORE}', 'custom_one')`)).toMatchObject({ ok: false, message: expect.stringMatching(/^conflict:/) })
    expect(await attempt(`select public.save_role('${STORE}', 'custom_one', 'Custom', '', null, array['orders:read'], '2000-01-01T00:00:00Z', false)`)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/^conflict:/),
    })
    expect(await attempt(`select public.save_role('${STORE}', 'custom_two', 'Bad', '', null, array['not:real'], null, true)`)).toMatchObject({ ok: false })
  })

  it("moves updated_at on every staff change", async () => {
    const before = (await db.query<{ at: string }>(`select updated_at::text as at from public.staff_members where user_id = '${support}'`)).rows[0].at
    await db.exec(`update public.staff_members set display_name = 'Support' where user_id = '${support}'`)
    const after = (await db.query<{ at: string }>(`select updated_at::text as at from public.staff_members where user_id = '${support}'`)).rows[0].at
    expect(after).not.toBe(before)
  })

  it("shows the audit log to audit:read holders of the same store", async () => {
    await db.exec(`insert into public.audit_log (actor, action, entity, entity_id, store_id, reason) values ('${owner}', 'role.updated', 'role', 'x', '${STORE}', 'test')`)
    await as(db, "authenticated", second, async () => {
      expect((await attempt(`select reason from public.audit_log where action = 'role.updated'`)).rows).toEqual([{ reason: "test" }])
    })
    await as(db, "authenticated", support, async () => {
      expect((await attempt(`select reason from public.audit_log where action = 'role.updated'`)).rows).toEqual([])
    })
  })
})

describe("admin orders (migration 20261108090000)", () => {
  it("shows staff notes and orders to orders:read holders only", async () => {
    const { cart, ids, placeOrder } = await import("./harness")
    const cartId = await cart(db, [{ variantId: ids.variantA, quantity: 1 }])
    await placeOrder(db, cartId, "admin-notes-1", [{ variantId: ids.variantA, quantity: 1 }])
    const { rows } = await db.query<{ id: string }>(`select id from public.orders limit 1`)
    await db.exec(`insert into public.order_notes (order_id, author, author_name, body) values ('${rows[0].id}', '${owner}', 'Owner', 'Called the customer')`)
    await as(db, "authenticated", support, async () => {
      expect((await attempt(`select body from public.order_notes`)).rows).toEqual([{ body: "Called the customer" }])
      expect((await attempt(`select id from public.orders`)).rows?.length).toBe(1)
      expect(await attempt(`insert into public.order_notes (order_id, author, author_name, body) values ('${rows[0].id}', '${support}', 'x', 'y')`)).toMatchObject({ ok: false })
    })
    await as(db, "authenticated", suspended, async () => {
      expect((await attempt(`select body from public.order_notes`)).rows).toEqual([])
      expect((await attempt(`select id from public.orders`)).rows).toEqual([])
    })
  })
})
