import "server-only"

import { createFixturesCustomerRepository } from "@/server/customers/fixtures.repository"
import { adminService } from "@/server/admin"
import { createCustomerService } from "@/server/customers/service"
import { createStaffCustomers } from "@/server/customers/staff"
import { createSupabaseCustomerRepository } from "@/server/customers/supabase.repository"
import { dataDriver, localService, selectRepository } from "@/server/db/driver"
import { orderService } from "@/server/orders"
import { publish } from "@/server/platform/events"
import { serverEnv } from "@/lib/env.server"
import { systemActor } from "@/server/db/actor"
import { createFixturesCustomerAuthRepository } from "@/server/customers/auth.fixtures.repository"
import { fixtureAtomic } from "@/server/fixtures/atomic"
import { localStore } from "@/server/fixtures/store"
import { platform } from "@/server/platform"

const repository = selectRepository({ fixtures: createFixturesCustomerRepository, supabase: createSupabaseCustomerRepository })

/** The raw customer repository (admin lookups). */
export const customerRepository = repository
export const customerAuthRepository = () => localService(createFixturesCustomerAuthRepository())

export const customerService = () => {
  const orders = orderService()
  return createCustomerService({
    customers: repository(), publish, orders: { listForCustomer: orders.listForCustomer, anonymiseCustomer: orders.anonymiseCustomer },
    atomic: dataDriver() === "local" ? (operation) => localStore().run(operation) : fixtureAtomic,
    auth: dataDriver() === "supabase" ? undefined : { repository: customerAuthRepository(), actor: () => systemActor(serverEnv.STORE_ID, "auth:customer"), magicLinkEnabled: serverEnv.AUTH_MAGIC_LINK === "on", verificationEnabled: serverEnv.AUTH_EMAIL_VERIFICATION === "on" },
    securityEvent: (customer, action) => platform().audit({ actor: customer.id, storeId: customer.storeId, action, entity: "customer", entityId: customer.id, before: null, after: null }),
  })
}

/** Staff (admin) customer operations: permission checks, PII masking, step-up and audit. */
export const staffCustomers = () => {
  const orders = orderService()
  const admin = adminService()
  return createStaffCustomers({
    customers: repository(),
    orders: { listForCustomer: orders.listForCustomer, anonymiseCustomer: orders.anonymiseCustomer },
    audit: (staff, meta, entry) => admin.recordAudit(staff, meta, entry),
    assertSteppedUp: admin.assertSteppedUp,
  })
}

export { SESSION_DAYS, toProfile } from "@/server/customers/service"
export type * from "@/server/customers/types"
