import "server-only"

import type { Actor } from "./actor"
import { withActor } from "./context"

/** Only named, server-selected authentication operations receive a realm capability. */
export function realmService<T extends object>(service: T, capabilities: Partial<Record<keyof T, () => Actor>>): T {
  return new Proxy(service, {
    get(target, property, receiver) {
      const operation: unknown = Reflect.get(target, property, receiver), capability: unknown = Reflect.get(capabilities, property)
      if (typeof operation !== "function" || typeof capability !== "function") return operation
      return (...args: unknown[]) => withActor(Reflect.apply(capability, capabilities, []), () => Reflect.apply(operation, target, args))
    },
  })
}
