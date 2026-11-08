import "server-only"

import { createHash, timingSafeEqual } from "node:crypto"

import { secureCookies, serverEnv } from "@/lib/env.server"
import { serverSiteUrl } from "@/lib/site-server"
import type { Permission } from "@/server/admin/permissions"
import { systemActor } from "@/server/db/actor"
import { withActor } from "@/server/db/context"
import { assertRequestOrigin } from "@/server/http/origin"
import { errorResponse } from "@/server/http/route"
import { enforceRateLimit } from "@/server/platform/guards"
import { DomainError } from "@/server/shared/errors"

export type ApiScope = "read" | "write"
export type ApiClient = { name: string; scopes: ApiScope[]; identity: string }

const readPermissions: Permission[] = ["orders:read", "customers:read_pii", "products:read", "products:export", "collections:read", "inventory:read", "pricing:read", "payments:read"]
const writePermissions: Permission[] = ["orders:write", "orders:fulfil", "orders:mark_paid", "orders:cancel", "orders:refund", "orders:returns", "products:import", "products:write", "products:publish", "pricing:write", "inventory:adjust"]

/** API_KEYS="name:key:read+write,other:key2:read". Keys are compared as SHA-256 digests in constant time. */
function clients() {
  return serverEnv.API_KEYS.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, key, scopes = "read"] = entry.split(":")
      return { name, digest: createHash("sha256").update(key ?? "").digest(), scopes: scopes.split("+") as ApiScope[] }
    })
}

function authenticate(request: Request, scope: ApiScope): ApiClient {
  const key = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-api-key") ?? ""
  const digest = createHash("sha256").update(key).digest()
  const client = key ? clients().find((item) => timingSafeEqual(item.digest, digest)) : undefined
  if (!client) throw new DomainError("unauthorized", "Missing or invalid API key.")
  if (!client.scopes.includes(scope)) throw new DomainError("forbidden", `This key lacks the "${scope}" scope.`)
  return { name: client.name, scopes: client.scopes, identity: client.digest.toString("hex") }
}

/** Headless API handler: API-key auth with scopes, per-client rate limit, JSON errors. */
export function apiV1<Context = unknown>(scope: ApiScope, handler: (request: Request, client: ApiClient, context: Context) => Promise<Response>) {
  return async (request: Request, context: Context) => {
    try {
      const client = authenticate(request, scope)
      assertRequestOrigin(request, { siteUrl: serverSiteUrl(), allowLoopbackHttp: !secureCookies(serverEnv) })
      const actor = { ...systemActor(serverEnv.STORE_ID, "integration", [...readPermissions, ...(scope === "write" ? writePermissions : [])]), id: "api-key:" + client.identity }
      return await withActor(actor, async () => {
        await enforceRateLimit("api", `client:${client.identity}`)
        const response = await handler(request, client, context)
        response.headers.set("x-api-version", "1")
        if (!response.headers.has("cache-control")) response.headers.set("cache-control", "no-store")
        return response
      })
    } catch (error) {
      return errorResponse(error)
    }
  }
}
