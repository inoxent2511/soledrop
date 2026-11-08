import "server-only"

import type { Actor } from "./actor"
import { withActor } from "./context"

/** Only named, server-selected authentication operations receive a realm capability. */
export function realmService<T extends object>(service: T, capabilities: Partial<Record<keyof T, (args: readonly unknown[]) => Actor | null>>): T {
  return new Proxy(service, {
    get(target, property, receiver) {
      const operation: unknown = Reflect.get(target, property, receiver), capability: unknown = Reflect.get(capabilities, property)
      if (typeof operation !== "function" || typeof capability !== "function") return operation
      return (...args: unknown[]) => {
        const actor = Reflect.apply(capability, capabilities, [args]) as Actor | null
        return actor ? withActor(actor, () => Reflect.apply(operation, target, args)) : Reflect.apply(operation, target, args)
      }
    },
  })
}
