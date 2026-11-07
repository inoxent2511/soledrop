import "server-only"

import { cookies } from "next/headers"
import { secureCookies, serverEnv } from "@/lib/env.server"

export const MAGIC_BROWSER_COOKIE = "sd_auth_link"
export const OIDC_BROWSER_COOKIE = "sd_oidc"

export async function setAuthBrowserCookie(name: typeof MAGIC_BROWSER_COOKIE | typeof OIDC_BROWSER_COOKIE, nonce: string) {
  ;(await cookies()).set(name, nonce, { httpOnly: true, secure: secureCookies(serverEnv), sameSite: "lax", path: "/api/auth", maxAge: name === MAGIC_BROWSER_COOKIE ? 900 : 300 })
}

export async function clearAuthBrowserCookie(name: typeof MAGIC_BROWSER_COOKIE | typeof OIDC_BROWSER_COOKIE) {
  ;(await cookies()).set(name, "", { httpOnly: true, secure: secureCookies(serverEnv), sameSite: "lax", path: "/api/auth", maxAge: 0 })
}
