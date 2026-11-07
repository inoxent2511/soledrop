import "server-only"

import { createHash } from "node:crypto"
import * as oidc from "openid-client"
import { z } from "zod"
import { hashToken, newToken, seal, unseal } from "@/server/admin/crypto"
import type { CustomerAuthRepository } from "@/server/customers/auth"
import type { CustomerService } from "@/server/customers/service"
import type { Actor } from "@/server/db/actor"
import { DomainError } from "@/server/shared/errors"

type Options = { issuer: string; clientId: string; clientSecret: string; redirectUri: string; secret: string }
type Deps = {
  repository: CustomerAuthRepository
  actor: () => Actor
  identity: CustomerService["fromVerifiedOAuth"]
  configuration?: () => Promise<oidc.Configuration>
}
const proofSchema = z.object({ verifier: z.string().min(43).max(128), nonce: z.string().min(32), linkedCustomerId: z.string().nullable() })
const tokenPattern = /^[A-Za-z0-9_-]{43,128}$/
const purpose = "customer-oidc-pkce"

/** OIDC authorization-code flow: maintained protocol validation, S256, nonce and browser state.
 * https://github.com/panva/openid-client/blob/main/docs/functions/authorizationCodeGrant.md
 */
export function createOidcAdapter(options: Options, deps: Deps) {
  const issuer = new URL(options.issuer), redirect = new URL(options.redirectUri)
  if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash) throw new Error("OIDC issuer must be a configured HTTPS URL")
  if (redirect.protocol !== "https:" && !["127.0.0.1", "localhost", "[::1]"].includes(redirect.hostname)) throw new Error("OIDC callback requires HTTPS")
  let configuration: Promise<oidc.Configuration> | undefined
  const config = () => configuration ??= (deps.configuration ? deps.configuration() : oidc.discovery(issuer, options.clientId, options.clientSecret, undefined, { timeout: 10 })).then((value) => { oidc.enableNonRepudiationChecks(value); return value }).catch((error: unknown) => { configuration = undefined; throw error })
  const provider = () => createHash("sha256").update(deps.actor().storeId + ":" + issuer.href).digest("hex").slice(0, 30)

  return {
    async start(linkedCustomerId: string | null) {
      const client = await config(), state = oidc.randomState(), browserNonce = newToken(), verifier = oidc.randomPKCECodeVerifier(), nonce = oidc.randomNonce()
      const url = oidc.buildAuthorizationUrl(client, { response_type: "code", scope: "openid email profile", redirect_uri: redirect.href, state, nonce, code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256" })
      await deps.repository.saveOAuthState(deps.actor(), { tokenHash: hashToken(state), storeId: deps.actor().storeId, browserHash: hashToken(browserNonce), sealedProof: seal(JSON.stringify({ verifier, nonce, linkedCustomerId }), options.secret, purpose), expiresAt: new Date(Date.now() + 300_000).toISOString() })
      return { url: url.href, browserNonce }
    },

    async complete(callbackUrl: URL, browserNonce: string | undefined, signedInCustomerId: string | null) {
      const state = callbackUrl.searchParams.get("state")
      if (callbackUrl.origin !== redirect.origin || callbackUrl.pathname !== redirect.pathname || !state || !tokenPattern.test(state) || !browserNonce || !tokenPattern.test(browserNonce)) throw new DomainError("unauthorized", "This sign-in expired. Start again in this browser.")
      const record = await deps.repository.takeOAuthState(deps.actor(), hashToken(state), hashToken(browserNonce))
      if (!record) throw new DomainError("unauthorized", "This sign-in expired. Start again in this browser.")
      const proof = proofSchema.parse(JSON.parse(unseal(record.sealedProof, options.secret, purpose)))
      if (proof.linkedCustomerId && proof.linkedCustomerId !== signedInCustomerId) throw new DomainError("unauthorized", "Sign in to your account before connecting this identity.")
      let claims: ReturnType<Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>["claims"]>
      try {
        const tokens = await oidc.authorizationCodeGrant(await config(), callbackUrl, { pkceCodeVerifier: proof.verifier, expectedState: state, expectedNonce: proof.nonce, idTokenExpected: true })
        claims = tokens.claims()
        // Access/refresh tokens are intentionally never persisted or exposed to a browser.
      } catch {
        throw new DomainError("unauthorized", "We couldn't verify that sign-in. Please try again.")
      }
      if (!claims || typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 190 || typeof claims.email !== "string" || claims.email_verified !== true) throw new DomainError("unauthorized", "A verified email is required to sign in.")
      const email = claims.email.trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) throw new DomainError("unauthorized", "A verified email is required to sign in.")
      return deps.identity({ provider: provider(), subject: claims.sub, email, fullName: (typeof claims.name === "string" ? claims.name : email.split("@")[0]).trim().slice(0, 190), linkedCustomerId: proof.linkedCustomerId })
    },
  }
}
