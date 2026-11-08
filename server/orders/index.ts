import "server-only"
import { createMysqlOrderRepository } from "@/server/orders/mysql.repository"
import { staffService } from "@/server/db/staff-service"

import { serverEnv } from "@/lib/env.server"
import { availablePaymentProviders, paymentProvider } from "@/server/adapters/payments"
import { cartService } from "@/server/cart"
import { catalog } from "@/server/catalog"
import { selectRepository } from "@/server/db/driver"
import { createFixturesOrderRepository } from "@/server/orders/fixtures.repository"
import { createOrderService } from "@/server/orders/service"
import { createStaffOrders } from "@/server/orders/staff"
import { adminService } from "@/server/admin"
import { createSupabaseOrderRepository } from "@/server/orders/supabase.repository"
import { currentActor, establishCheckoutEmail, establishOrderLookup, establishOrderToken, withActor } from "@/server/db/context"
import { systemActor } from "@/server/db/actor"
import type { CheckoutInput, OrderViewer } from "@/server/orders/service"

const repository = selectRepository({ mysql: createMysqlOrderRepository,  fixtures: createFixturesOrderRepository, supabase: createSupabaseOrderRepository })

export const orderService = () => {
  const service = createOrderService({
    orders: repository(),
    carts: cartService(),
    catalog: catalog(),
    payments: { get: paymentProvider, available: availablePaymentProviders },
    secret: serverEnv.SESSION_SECRET,
    trustedPayment: (operation) => withActor(systemActor(currentActor().storeId, "integration", ["orders:read", "orders:mark_paid"]), operation),
  })
  return {
    ...service,
    checkout(input: CheckoutInput) { establishCheckoutEmail(input.email); return service.checkout(input) },
    findForViewer(storeId: string, number: string, viewer: OrderViewer) { establishOrderToken(viewer.token); return service.findForViewer(storeId, number, viewer) },
    lookup(storeId: string, number: string, email: string) { establishOrderLookup(number, email); return service.lookup(storeId, number, email) },
    cancelByCustomer(...args: Parameters<typeof service.cancelByCustomer>) { establishOrderToken(args[1].token); return service.cancelByCustomer(...args) },
    requestReturn(...args: Parameters<typeof service.requestReturn>) { establishOrderToken(args[1].token); return service.requestReturn(...args) },
  }
}

export { ORDER_STATUS_LABEL, ORDER_TRANSITIONS, customerCanCancel, customerCanRequestReturn } from "@/server/orders/state-machine"
export type { CheckoutInput, CheckoutResult, OrderViewer } from "@/server/orders/service"
export type * from "@/server/orders/types"

/** Staff (admin) order operations: permission checks, PII masking and audit on top of orderService. */
export const staffOrders = () => {
  const admin = adminService()
  return staffService(createStaffOrders({ orders: orderService(), audit: (staff, meta, entry) => admin.recordAudit(staff, meta, entry), assertSteppedUp: admin.assertSteppedUp }))
}
