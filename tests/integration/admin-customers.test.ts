import { beforeEach, describe, expect, it } from "vitest"

import { PRESET_ROLES } from "@/server/admin/permissions"
import { resolvePermissions, type RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import { customerService } from "@/server/customers"
import { createFixturesCustomerRepository } from "@/server/customers/fixtures.repository"
import { createStaffCustomers } from "@/server/customers/staff"
import { STORE_ID } from "@/server/fixtures/seed"
import { db, resetFixtures } from "@/server/fixtures/store"
import { orderService } from "@/server/orders"
import { DomainError } from "@/server/shared/errors"

/** Staff customer operations (admin A4) on the fixtures driver. */

const meta: RequestMeta = { ip: "203.0.113.9", userAgent: "vitest", requestId: "req" }
let audits: { action: string; reason?: string | null }[] = []

function staffAs(roleKey: string, steppedUp = true): StaffContext {
  const role = PRESET_ROLES.find((preset) => preset.key === roleKey)!
  const { permissions, refundLimit } = resolvePermissions([{ permissions: [...role.permissions], refundLimit: role.refundLimit }])
  return {
    member: { userId: `user-${roleKey}`, storeId: STORE_ID, email: `${roleKey}@example.com`, displayName: role.name, status: "active", totpEnabledAt: "2026-01-01T00:00:00Z" },
    session: { id: `s-${roleKey}`, aal: 2, mfaAt: steppedUp ? new Date().toISOString() : "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z" },
    roles: [{ id: roleKey, key: roleKey, name: role.name, refundLimit: role.refundLimit }],
    permissions,
    refundLimit,
  }
}

const staff = () => {
  const orders = orderService()
  return createStaffCustomers({
    customers: createFixturesCustomerRepository(),
    orders: { listForCustomer: orders.listForCustomer, anonymiseCustomer: orders.anonymiseCustomer },
    audit: async (_staff, _meta, entry) => void audits.push(entry),
    assertSteppedUp: (member) => {
      if (!member.session.mfaAt || Date.parse(member.session.mfaAt) + 600_000 < Date.now()) throw new DomainError("forbidden", "Step up", { stepUp: true })
    },
  })
}

async function register(email: string, fullName: string, phone: string | null = null) {
  const { customer } = await customerService().register(STORE_ID, { email, password: "shopper-pass-1234", fullName, marketingOptIn: true })
  if (phone) await customerService().updateProfile(customer.id, { phone })
  return customer
}

beforeEach(() => {
  resetFixtures()
  audits = []
})

describe("staff customers", () => {
  it("searches by email, name and phone digits, and masks contact details without PII access", async () => {
    const ayesha = await register("ayesha@example.com", "Ayesha Khan", "0300-1234567")
    await register("bilal@example.com", "Bilal Ahmed")
    const support = staffAs("support_agent")
    expect((await staff().list(support, { q: "bilal", page: 1, pageSize: 25 })).rows.map((row) => row.fullName)).toEqual(["Bilal Ahmed"])
    expect((await staff().list(support, { q: "1234567", page: 1, pageSize: 25 })).rows.map((row) => row.id)).toEqual([ayesha.id])
    expect((await staff().list(support, { q: "0300 1234", page: 1, pageSize: 25 })).rows).toHaveLength(1)

    const marketing = staffAs("marketing")
    const masked = await staff().detail(marketing, ayesha.id)
    expect(masked).toMatchObject({ piiMasked: true, customer: { email: "a•••@example.com", phone: "•••567" } })
    await expect(staff().list(staffAs("fulfilment"), { page: 1, pageSize: 25 })).rejects.toMatchObject({ code: "forbidden" })
  })

  it("updates groups and consent with an audit diff, and keeps contact edits to PII holders", async () => {
    const customer = await register("cara@example.com", "Cara Lee")
    const updated = await staff().update(staffAs("support_agent"), meta, customer.id, { group: "wholesale", marketingOptIn: false }, "Trade account")
    expect(updated).toMatchObject({ group: "wholesale", marketingOptIn: false })
    expect(audits[0]).toMatchObject({ action: "customer.updated", reason: "Trade account" })
    expect(db().customers.find((row) => row.id === customer.id)?.group).toBe("wholesale")
    await expect(staff().update(staffAs("marketing"), meta, customer.id, { fullName: "X" }, null)).rejects.toMatchObject({ code: "forbidden" })
  })

  it("exports and erases only with the permission and a fresh second factor", async () => {
    const customer = await register("dan@example.com", "Dan Malik")
    await expect(staff().exportData(staffAs("support_agent"), meta, customer.id, "Customer request")).rejects.toMatchObject({ code: "forbidden" })
    await expect(staff().exportData(staffAs("owner", false), meta, customer.id, "Customer request")).rejects.toMatchObject({ details: { stepUp: true } })
    const data = await staff().exportData(staffAs("owner"), meta, customer.id, "Customer request")
    expect(data.profile.email).toBe("dan@example.com")
    expect(JSON.stringify(data)).not.toContain("passwordHash")

    await expect(staff().erase(staffAs("store_manager"), meta, customer.id, "Asked by email")).rejects.toMatchObject({ code: "forbidden" })
    await staff().erase(staffAs("owner"), meta, customer.id, "Asked by email")
    expect(db().customers.find((row) => row.id === customer.id)).toMatchObject({ fullName: "Deleted customer", passwordHash: "" })
    await expect(staff().detail(staffAs("owner"), customer.id)).rejects.toMatchObject({ code: "not_found" })
    await expect(customerService().login(STORE_ID, "dan@example.com", "shopper-pass-1234")).rejects.toMatchObject({ code: "unauthorized" })
    expect(audits.map((entry) => entry.action)).toEqual(["customer.exported", "customer.erased"])
  })
})
