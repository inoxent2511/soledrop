import { DomainError } from "@/server/shared/errors"

const loopback = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host)
const hasAuthCookie = (request: Request) => /(?:^|;\s*)(?:sd_session|sd_staff|sd_cart)=/.test(request.headers.get("cookie") ?? "")

/** Browser mutations use exact origins; bearer-only jobs/webhooks can omit Origin. */
export function assertRequestOrigin(request: Request, options: { siteUrl: string; allowLoopbackHttp: boolean; requireOrigin?: boolean }) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return
  const given = request.headers.get("origin")
  const publicAuth = /^\/api\/(?:admin\/)?auth\//.test(new URL(request.url).pathname)
  if (!given) {
    if (options.requireOrigin || publicAuth || hasAuthCookie(request)) throw new DomainError("forbidden", "Cross-site request blocked.")
    return
  }
  let parsed: URL
  try { parsed = new URL(given) } catch { throw new DomainError("forbidden", "Cross-site request blocked.") }
  if (parsed.origin !== given) throw new DomainError("forbidden", "Cross-site request blocked.")
  const allowed = new Set([new URL(options.siteUrl).origin])
  const target = new URL(request.url)
  if (options.allowLoopbackHttp && loopback(target.hostname)) allowed.add(target.origin)
  if (!allowed.has(parsed.origin)) throw new DomainError("forbidden", "Cross-site request blocked.")
}
