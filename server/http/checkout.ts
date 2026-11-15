import "server-only"

import { catalog } from "@/server/catalog"
import { customerService, toProfile } from "@/server/customers"
import { currentStoreId } from "@/server/db/driver"
import { currentCustomer } from "@/server/http/route"

/** What the checkout page needs besides the bag: who is shopping, their saved addresses and the order's custom fields. */
export async function checkoutContext() {
  const customer = await currentCustomer()
  const [addresses, definitions] = await Promise.all([
    customer ? customerService().listAddresses(customer.id) : Promise.resolve([]),
    catalog().customFieldDefinitions(currentStoreId()),
  ])
  return {
    customer: customer ? toProfile(customer) : null,
    addresses,
    orderFields: definitions.filter((definition) => definition.entity === "order" && definition.visibleOnStorefront && definition.code !== "gift_note"),
  }
}

export type CheckoutContext = Awaited<ReturnType<typeof checkoutContext>>
