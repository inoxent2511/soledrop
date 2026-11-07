import type { Actor } from "@/server/db/actor"

export type CustomerSecurity = { emailVerifiedAt: string | null; failedLogins: number; lockedUntil: string | null }
export type CustomerTokenKind = "verify_email" | "magic_link"
export type CustomerToken = { tokenHash: string; storeId: string; kind: CustomerTokenKind; identityId: string; email: string; browserHash: string | null; expiresAt: string; usedAt: string | null }
export type CustomerSessionSummary = { id: string; createdAt: string; expiresAt: string; current: boolean }
export type OAuthState = { tokenHash: string; storeId: string; browserHash: string; sealedProof: string; expiresAt: string }

/** Additional auth capabilities; every storage boundary requires an explicit actor. */
export interface CustomerAuthRepository {
  security(actor: Actor, customerId: string): Promise<CustomerSecurity>
  loginResult(actor: Actor, customerId: string, success: boolean): Promise<CustomerSecurity>
  createToken(actor: Actor, token: CustomerToken): Promise<void>
  consumeToken(actor: Actor, kind: CustomerTokenKind, tokenHash: string, browserHash: string | null): Promise<CustomerToken | null>
  verifyEmail(actor: Actor, customerId: string, email: string): Promise<void>
  sessions(actor: Actor, customerId: string, currentTokenHash: string): Promise<CustomerSessionSummary[]>
  revokeSession(actor: Actor, customerId: string, sessionId: string): Promise<void>
  saveOAuthState(actor: Actor, state: OAuthState): Promise<void>
  takeOAuthState(actor: Actor, tokenHash: string, browserHash: string): Promise<OAuthState | null>
  oauthCustomer(actor: Actor, provider: string, subject: string): Promise<string | null>
  linkOAuth(actor: Actor, customerId: string, provider: string, subject: string): Promise<void>
}
