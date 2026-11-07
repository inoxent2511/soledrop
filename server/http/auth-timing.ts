import { randomInt } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"

/** Comparable responses for known/unknown identities, including cold hash and token paths. */
export async function finishAuthTiming(request: Request, started: number) {
  if (!/^\/api\/(?:admin\/)?auth\//.test(new URL(request.url).pathname)) return
  const remaining = 350 + randomInt(0, 21) - (performance.now() - started)
  if (remaining > 0) await delay(remaining)
}
