import "server-only"

import { cookies, headers } from "next/headers"
import { z } from "zod"

import { publicEnv } from "@/lib/env"
import { secureCookies, serverEnv } from "@/lib/env.server"
import { customerService } from "@/server/customers"
import type { Customer } from "@/server/customers/types"
import { currentStoreId } from "@/server/db/driver"
import { anonymousActor } from "@/server/db/actor"
import { currentActor, establishActor, establishCartToken, establishCustomer, withActor } from "@/server/db/context"
import { forwardedClient } from "@/server/http/client-key"
import { assertRequestOrigin } from "@/server/http/origin"
import { finishAuthTiming } from "@/server/http/auth-timing"
import { DomainError, isDomainError } from "@/server/shared/errors"

export const SESSION_COOKIE = "sd_session"
export const CART_COOKIE = "sd_cart"
export const CHECKOUT_COOKIE = "sd_checkout"

export type ApiError = { error: { code: string; message: string; details?: Record<string, unknown> } }

/** Uniform JSON error body; messages of DomainErrors are written for shoppers. */
export function errorResponse(error: unknown): Response {
  if (isDomainError(error)) {
    const headersInit: HeadersInit = error.code === "rate_limited" ? { "retry-after": String(error.details?.retryAfter ?? 60) } : {}
    return Response.json({ error: { code: error.code, message: error.message, details: error.details } } satisfies ApiError, { status: error.status, headers: headersInit })
  }
  console.error(error)
  return Response.json({ error: { code: "internal", message: "Something went wrong on our side. Please try again." } } satisfies ApiError, { status: 500 })
}

/**
 * Cookie-authenticated mutations must come from our own origin (CSRF defence in depth on top
 * of SameSite=Lax). Bearer-only integrations may omit Origin; browser auth/cart writes may not.
 */
async function assertSameOrigin(request: Request) {
  assertRequestOrigin(request, { siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL, allowLoopbackHttp: !secureCookies(serverEnv) })
}

/** Wraps a route handler: origin check, error mapping, no caching of personal responses. */
export function route<Context = unknown>(handler: (request: Request, context: Context) => Promise<Response>) {
  return async (request: Request, context: Context) => withActor(anonymousActor(currentStoreId()), async () => {
    const started = performance.now()
    try {
      await assertSameOrigin(request)
      const response = await handler(request, context)
      if (!response.headers.has("cache-control")) response.headers.set("cache-control", "private, no-store")
      return response
    } catch (error) {
      return errorResponse(error)
    } finally {
      await finishAuthTiming(request, started)
    }
  })
}

/** Parses and validates a JSON body; field errors come back as `details.fields`. */
export async function parseBody<Schema extends z.ZodType>(request: Request, schema: Schema): Promise<z.infer<Schema>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new DomainError("validation", "The request body must be JSON.")
  }
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new DomainError("validation", "Please check the highlighted fields.", { fields: z.flattenError(result.error).fieldErrors })
  }
  return result.data
}

/** The client key used for rate limits: the address our own proxies saw (TRUSTED_PROXY_HOPS, BUG-015). */
export async function clientKey(): Promise<string> {
  const list = await headers()
  return forwardedClient(list.get("x-forwarded-for"), serverEnv.TRUSTED_PROXY_HOPS)
}

const cookieBase = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: secureCookies(serverEnv) }

export async function setSessionCookie(token: string, expiresAt: string) {
  ;(await cookies()).set(SESSION_COOKIE, token, { ...cookieBase, expires: new Date(expiresAt) })
}

export async function clearSessionCookie() {
  ;(await cookies()).delete(SESSION_COOKIE)
}

export async function setCartCookie(token: string) {
  ;(await cookies()).set(CART_COOKIE, token, { ...cookieBase, maxAge: 60 * 60 * 24 * 30 })
  establishCartToken(token)
}

export async function clearCartCookie() {
  ;(await cookies()).delete(CART_COOKIE)
}

/** Preserve cart ownership for a lost checkout response after the active bag is cleared. */
export async function rememberCheckoutCart() {
  const jar = await cookies(), token = jar.get(CART_COOKIE)?.value
  if (token) jar.set(CHECKOUT_COOKIE, token, { ...cookieBase, path: "/api/checkout", maxAge: 30 * 60 })
}

/** The signed-in customer for this request, if any. */
export async function currentCustomer(): Promise<Customer | null> {
  const jar = await cookies(), token = jar.get(SESSION_COOKIE)?.value
  establishCartToken(jar.get(CART_COOKIE)?.value ?? jar.get(CHECKOUT_COOKIE)?.value)
  const customer = await customerService().fromSession(token)
  if (customer && token && currentActor().kind !== "staff") establishCustomer(customer, token)
  else if (!customer && currentActor().kind === "customer") {
    const previous = currentActor()
    establishActor({ ...anonymousActor(currentStoreId()), ...(previous.kind === "customer" ? { cartTokenHash: previous.cartTokenHash } : {}) })
  }
  return customer
}

export async function requireCustomer(): Promise<Customer> {
  const customer = await currentCustomer()
  if (!customer) throw new DomainError("unauthorized", "Please sign in to continue.")
  return customer
}

/** Who is shopping: drives price lists (customer group), promotions and order ownership. */
export async function shopperContext(customer?: Customer | null) {
  const resolved = customer === undefined ? await currentCustomer() : customer
  return {
    storeId: currentStoreId(),
    customerId: resolved?.id ?? null,
    customerGroup: resolved?.group ?? null,
    email: resolved?.email ?? null,
  }
}
