import "server-only"

import { createFixturesCustomerRepository } from "@/server/customers/fixtures.repository"
import { adminService } from "@/server/admin"
import { createCustomerService } from "@/server/customers/service"
import { createStaffCustomers } from "@/server/customers/staff"
import { createSupabaseCustomerRepository } from "@/server/customers/supabase.repository"
import { selectRepository } from "@/server/db/driver"
import { orderService } from "@/server/orders"
import { publish } from "@/server/platform/events"

const repository = selectRepository({ fixtures: createFixturesCustomerRepository, supabase: createSupabaseCustomerRepository })

/** The raw customer repository (admin lookups). */
export const customerRepository = repository

export const customerService = () => {
  const orders = orderService()
  return createCustomerService({ customers: repository(), publish, orders: { listForCustomer: orders.listForCustomer, anonymiseCustomer: orders.anonymiseCustomer } })
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
