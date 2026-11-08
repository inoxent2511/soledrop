import { ACTOR_SCOPED, type Actor, type ActorScoped } from "./actor"

/** Binds a required actor at the service injection seam, never an implicit system identity. */
export function bindActor<T extends object>(repository: ActorScoped<T>, actor: () => Actor): T {
  return new Proxy(repository, {
    get(target, key) {
      if (key === ACTOR_SCOPED) return false
      const value: unknown = Reflect.get(target, key)
      if (typeof value !== "function") return value
      return (...args: unknown[]) => Reflect.apply(value, target, [actor(), ...args])
    },
  }) as unknown as T
}
