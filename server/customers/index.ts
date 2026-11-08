import "server-only"
import { createMysqlCustomerRepository, rehashCustomerPassword } from "@/server/customers/mysql.repository"

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
import { localStore, withFixtureStore } from "@/server/fixtures/store"
import { platform } from "@/server/platform"
import { currentActor } from "@/server/db/context"
import { realmService } from "@/server/db/realm-service"
import { staffService } from "@/server/db/staff-service"
import { createMysqlCustomerAuthRepository } from "@/server/customers/auth.mysql.repository"
import { authTransaction } from "@/server/db/auth.repository"

const repository = selectRepository({ mysql: createMysqlCustomerRepository,  fixtures: createFixturesCustomerRepository, supabase: createSupabaseCustomerRepository })

/** The raw customer repository (admin lookups). */
export const customerRepository = repository
export const customerAuthRepository = () => dataDriver() === "mysql" ? createMysqlCustomerAuthRepository() : localService(createFixturesCustomerAuthRepository())

export const customerService = () => {
  const orders = orderService()
  const service = createCustomerService({
    customers: repository(), publish, orders: { listForCustomer: orders.listForCustomer, anonymiseCustomer: orders.anonymiseCustomer },
    atomic: dataDriver() === "mysql" ? (operation) => authTransaction(systemActor(currentActor().storeId, "auth:customer"), operation) : dataDriver() === "local" ? (operation) => localStore().run(operation) : (operation) => withFixtureStore(currentActor(), () => fixtureAtomic(operation)),
    rehashPassword: dataDriver() === "mysql" ? (customer, next) => rehashCustomerPassword(systemActor(customer.storeId, "auth:customer"), customer.id, customer.passwordHash, next) : undefined,
    auth: dataDriver() === "supabase" ? undefined : { repository: customerAuthRepository(), actor: currentActor, magicLinkEnabled: serverEnv.AUTH_MAGIC_LINK === "on", verificationEnabled: serverEnv.AUTH_EMAIL_VERIFICATION === "on" },
    securityEvent: (customer, action) => platform().audit({ actor: customer.id, storeId: customer.storeId, action, entity: "customer", entityId: customer.id, before: null, after: null }),
  })
  const auth = () => systemActor(serverEnv.STORE_ID, "auth:customer")
  return realmService(service, {
    register: auth, login: auth, logout: auth, fromSession: auth,
    requestPasswordReset: auth, resetPassword: auth, changePassword: auth, changeEmail: auth,
    requestMagicLink: auth, requestVerification: auth, redeemLink: auth, fromVerifiedOAuth: auth,
    deleteAccount: () => systemActor(serverEnv.STORE_ID, "auth:customer", ["customers:delete"]),
  })
}

/** Staff (admin) customer operations: permission checks, PII masking, step-up and audit. */
export const staffCustomers = () => {
  const orders = orderService()
  const admin = adminService()
  return staffService(localService(createStaffCustomers({
    customers: repository(),
    orders: { listForCustomer: orders.listForCustomer, anonymiseCustomer: orders.anonymiseCustomer },
    audit: (staff, meta, entry) => admin.recordAudit(staff, meta, entry),
    assertSteppedUp: admin.assertSteppedUp,
  }), ["update", "signOut", "exportData", "erase"]))
}

export { SESSION_DAYS, toProfile } from "@/server/customers/service"
export type * from "@/server/customers/types"
