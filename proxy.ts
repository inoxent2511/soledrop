import { NextResponse, type NextRequest } from "next/server"

import { adminCsp } from "@/lib/admin-csp"

/**
 * Admin edge checks (A-006 layer 1). Optimistic only: no session cookie means no admin, so the
 * request is turned away before any rendering. The real checks (session, AAL2, permission) run in
 * server/admin/dal.ts on every page and handler, and RLS backs them in the database.
 *
 * Every /admin response also gets a strict per-request nonce CSP and is never cached.
 */

const STAFF_COOKIE = "sd_staff"
const PUBLIC_PAGES = [/^\/admin\/login\/?$/, /^\/admin\/invite\/[^/]+\/?$/]
const PUBLIC_API = [/^\/api\/admin\/auth\/(login|invite|logout)(\/|$)/]

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const signedIn = Boolean(request.cookies.get(STAFF_COOKIE)?.value)

  if (pathname.startsWith("/api/admin")) {
    if (!signedIn && !PUBLIC_API.some((pattern) => pattern.test(pathname))) {
      return NextResponse.json({ error: { code: "unauthorized", message: "Please sign in to the admin." } }, { status: 401, headers: { "cache-control": "no-store" } })
    }
    return NextResponse.next()
  }

  if (!signedIn && !PUBLIC_PAGES.some((pattern) => pattern.test(pathname))) {
    const login = new URL("/admin/login", request.url)
    login.searchParams.set("next", pathname + search)
    return NextResponse.redirect(login)
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const csp = adminCsp(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("content-security-policy", csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("content-security-policy", csp)
  response.headers.set("cache-control", "private, no-store")
  response.headers.set("x-robots-tag", "noindex, nofollow")
  return response
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
}
