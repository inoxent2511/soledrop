import "server-only"

import { publicEnv } from "@/lib/env"
import { serverEnv } from "@/lib/env.server"
import { customerAuthRepository, customerService } from "@/server/customers"
import { createOidcAdapter } from "@/server/adapters/auth/oidc"
import { systemActor } from "@/server/db/actor"
import { currentStoreId, dataDriver } from "@/server/db/driver"
import { DomainError } from "@/server/shared/errors"

let instance: ReturnType<typeof createOidcAdapter> | undefined

export function customerOidc() {
  if (!serverEnv.OIDC_ISSUER || !serverEnv.OIDC_CLIENT_ID || !serverEnv.OIDC_CLIENT_SECRET || dataDriver() === "supabase") throw new DomainError("forbidden", "This sign-in option is unavailable.")
  return instance ??= createOidcAdapter({ issuer: serverEnv.OIDC_ISSUER, clientId: serverEnv.OIDC_CLIENT_ID, clientSecret: serverEnv.OIDC_CLIENT_SECRET, redirectUri: new URL("/api/auth/oauth/callback", publicEnv.NEXT_PUBLIC_SITE_URL).href, secret: serverEnv.SESSION_SECRET }, { repository: customerAuthRepository(), actor: () => systemActor(currentStoreId(), "auth:customer"), identity: (input) => customerService().fromVerifiedOAuth(input) })
}
