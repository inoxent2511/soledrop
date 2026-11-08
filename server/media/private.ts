import "server-only"

import { serverEnv } from "@/lib/env.server"
import { storage } from "@/server/adapters/storage"
import { createPrivateFiles } from "@/server/adapters/storage/private-files"
import { customerRepository } from "@/server/customers"
import { requireCustomerOwner, requireFreshGrant, requireGrant } from "@/server/db/actor"
import { withActor } from "@/server/db/context"
import { orderService } from "@/server/orders"
import { DomainError } from "@/server/shared/errors"
import { admitActor } from "@/server/db/admission.repository"

/** Internal invoice/return/export seam. Existing screens need no new upload options. */
export const privateFiles = () => createPrivateFiles({
  storeId: serverEnv.STORE_ID, secret: serverEnv.SESSION_SECRET, storage: storage(),
  authorize: async (requested, resource) => {
    const actor = await admitActor(requested)
    return withActor(actor, async () => {
      if (resource.kind === "order") {
        if (actor.kind === "staff") requireGrant(actor, "customers:read_pii")
        if (!await orderService().findById(resource.id)) throw new DomainError("not_found", "Order not found.")
      } else {
        requireCustomerOwner(actor, resource.id, "customers:read")
        if (actor.kind === "staff") { requireGrant(actor, "customers:read_pii"); requireFreshGrant(actor, "customers:export") }
        if (!await customerRepository().findById(resource.id)) throw new DomainError("not_found", "Account not found.")
      }
    })
  },
})
