import "server-only"

import type { Actor } from "./actor"
import { dataDriver } from "./driver"
import { mysqlPolicy } from "./policy.repository"
import { fixtureActorPolicy } from "./fixtures-policy.repository"

/** Admit non-query capabilities (for example signed private downloads) using the same live policy. */
export async function admitActor(actor: Actor): Promise<Actor> {
  if (dataDriver() === "mysql") return mysqlPolicy<{ admit: () => Promise<Actor> }>({ admit: async (effective) => effective }).admit(actor)
  return fixtureActorPolicy({ admit: async (effective: Actor) => effective }).admit(actor)
}
