import { generateKeyPairSync, sign } from "node:crypto"
import { beforeEach, describe, expect, it } from "vitest"
import * as oidc from "openid-client"
import { createOidcAdapter } from "@/server/adapters/auth/oidc"
import { createFixturesCustomerAuthRepository } from "@/server/customers/auth.fixtures.repository"
import { systemActor } from "@/server/db/actor"
import { db, resetFixtures } from "@/server/fixtures/store"

const issuer = "https://identity.example.test", redirect = "https://store.example.test/api/auth/oauth/callback", clientId = "soledrop-test"
const secret = "local-oidc-protocol-test-secret-at-least-32-characters"
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 }), otherKeys = generateKeyPairSync("rsa", { modulusLength: 2048 })
const actor = systemActor("00000000-0000-4000-8000-000000000001", "auth:customer")
const publicKey = { ...keys.publicKey.export({ format: "jwk" }), alg: "RS256", use: "sig", kid: "protocol-key" }
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")

describe("optional OIDC protocol boundary (all provider requests intercepted locally)", () => {
  beforeEach(resetFixtures)

  function setup(overrides: Record<string, unknown> = {}, wrongSignature = false) {
    let nonce = "", tokenCalls = 0
    const config = new oidc.Configuration({ issuer, authorization_endpoint: issuer + "/authorize", token_endpoint: issuer + "/token", jwks_uri: issuer + "/jwks", response_types_supported: ["code"], id_token_signing_alg_values_supported: ["RS256"] }, clientId, "test-client-secret")
    config[oidc.customFetch] = async (url, options) => {
      if (String(url) === issuer + "/jwks") return Response.json({ keys: [publicKey] })
      if (String(url) !== issuer + "/token") throw new Error("Unexpected outbound provider request")
      tokenCalls++
      const body = new URLSearchParams(String(options?.body))
      expect(body.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
      const now = Math.floor(Date.now() / 1000)
      const header = encode({ alg: "RS256", kid: "protocol-key" }), claims = encode({ iss: issuer, aud: clientId, sub: "verified-subject", iat: now, exp: now + 300, nonce, email: "verified@example.test", email_verified: true, name: "Verified Customer", ...overrides })
      const content = header + "." + claims
      const signature = sign("RSA-SHA256", Buffer.from(content), wrongSignature ? otherKeys.privateKey : keys.privateKey).toString("base64url")
      return Response.json({ access_token: "provider-access-token-never-persisted", token_type: "Bearer", expires_in: 300, id_token: content + "." + signature })
    }
    let identities = 0
    const adapter = createOidcAdapter({ issuer, clientId, clientSecret: "test-client-secret", redirectUri: redirect, secret }, {
      actor: () => actor, repository: createFixturesCustomerAuthRepository(), configuration: async () => config,
      identity: async (input) => {
        identities++
        return { customer: { id: "customer-id", email: input.email, fullName: input.fullName, phone: null, group: "retail", marketingOptIn: false, createdAt: new Date().toISOString() }, session: { token: "opaque-local-session", expiresAt: new Date(Date.now() + 60_000).toISOString() } }
      },
    })
    const start = async (customerId: string | null = null) => {
      const started = await adapter.start(customerId), url = new URL(started.url)
      nonce = url.searchParams.get("nonce")!
      const callback = new URL(redirect)
      callback.searchParams.set("state", url.searchParams.get("state")!); callback.searchParams.set("code", "test-authorization-code")
      return { ...started, callback, authorization: url }
    }
    return { adapter, start, calls: () => ({ tokenCalls, identities }) }
  }

  it("requires S256, state, nonce and browser binding, seals the verifier, and spends state once", async () => {
    const test = setup(), started = await test.start()
    expect(started.authorization.searchParams.get("code_challenge_method")).toBe("S256")
    expect(started.authorization.searchParams.get("scope")).toBe("openid email profile")
    expect(db().oauthStates?.[0].sealedProof).toMatch(/^v1\./)
    expect(JSON.stringify(db().oauthStates)).not.toContain(started.authorization.searchParams.get("state"))
    await expect(test.adapter.complete(started.callback, "wrong-browser", null)).rejects.toMatchObject({ code: "unauthorized" })
    expect(test.calls().tokenCalls).toBe(0)
    expect((await test.adapter.complete(started.callback, started.browserNonce, null)).customer.email).toBe("verified@example.test")
    await expect(test.adapter.complete(started.callback, started.browserNonce, null)).rejects.toMatchObject({ code: "unauthorized" })
    expect(test.calls()).toEqual({ tokenCalls: 1, identities: 1 })
    expect(JSON.stringify(db().oauthStates)).not.toContain("provider-access-token")
  })

  it.each([
    ["issuer", { iss: "https://attacker.example.test" }],
    ["audience", { aud: "another-client" }],
    ["nonce", { nonce: "wrong-nonce" }],
    ["expiry", { exp: 1 }],
    ["unverified email", { email_verified: false }],
    ["malformed email", { email: "not-an-email" }],
  ])("rejects a provider response with invalid %s before issuing an identity", async (_name, overrides) => {
    const test = setup(overrides as Record<string, unknown>), started = await test.start()
    await expect(test.adapter.complete(started.callback, started.browserNonce, null)).rejects.toMatchObject({ code: "unauthorized" })
    expect(test.calls().identities).toBe(0)
  })

  it("verifies the ID token signature against the provider JWKS", async () => {
    const test = setup({}, true), started = await test.start()
    await expect(test.adapter.complete(started.callback, started.browserNonce, null)).rejects.toMatchObject({ code: "unauthorized" })
    expect(test.calls().identities).toBe(0)
  })

  it("refuses linking when the initiating signed-in identity changed", async () => {
    const test = setup(), started = await test.start("customer-a")
    await expect(test.adapter.complete(started.callback, started.browserNonce, "customer-b")).rejects.toMatchObject({ code: "unauthorized" })
    expect(test.calls()).toEqual({ tokenCalls: 0, identities: 0 })
  })

  it("rejects a callback on another origin or path", async () => {
    const test = setup(), started = await test.start()
    const other = new URL(started.callback); other.hostname = "attacker.example.test"
    await expect(test.adapter.complete(other, started.browserNonce, null)).rejects.toMatchObject({ code: "unauthorized" })
    expect(test.calls().tokenCalls).toBe(0)
  })
})
