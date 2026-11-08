import "server-only"

import type { StaffContext } from "@/server/admin/types"
import { staffActor } from "./actor"
import { withActor } from "./context"

/** Staff domain operations already require a DAL-issued StaffContext as their first argument. */
export function staffService<T extends object>(service: T): T {
  return new Proxy(service, {
    get(target, property, receiver) {
      const operation: unknown = Reflect.get(target, property, receiver)
      if (typeof operation !== "function") return operation
      return (staff: StaffContext, ...args: unknown[]) => {
        if (!staff || typeof staff !== "object" || !("member" in staff) || !("session" in staff)) return Reflect.apply(operation, target, [staff, ...args])
        return withActor(staffActor(staff), () => Reflect.apply(operation, target, [staff, ...args]))
      }
    },
  })
}
