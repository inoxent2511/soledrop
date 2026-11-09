import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createAdminService } from "@/server/admin/service"
import type { StaffContext, StaffMember } from "@/server/admin/types"
import { createFixturesAdminRepository } from "@/server/admin/fixtures.repository"
import { createMysqlAdminRepository, rehashStaffPassword } from "@/server/admin/mysql.repository"
import type { AdminOperations } from "@/server/admin/repository"
import { hashToken, newToken } from "@/server/admin/crypto"
import { totpAt } from "@/server/admin/totp"
import { createCustomerService } from "@/server/customers/service"
import { createFixturesCustomerRepository } from "@/server/customers/fixtures.repository"
import { createMysqlCustomerRepository, rehashCustomerPassword } from "@/server/customers/mysql.repository"
import { createFixturesCustomerAuthRepository } from "@/server/customers/auth.fixtures.repository"
import { createMysqlCustomerAuthRepository } from "@/server/customers/auth.mysql.repository"
import type { CustomerOperations } from "@/server/customers/repository"
import { createFixturesPlatformRepository } from "@/server/platform/fixtures.repository"
import { createMysqlPlatformRepository } from "@/server/platform/mysql.repository"
import type { PlatformOperations } from "@/server/platform/repository"
import { openDeliveryPayload, sealDeliveryPayload } from "@/server/platform/private-payload"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import { systemActor, type Actor } from "@/server/db/actor"
import { bindActor } from "@/server/db/bind"
import { authTransaction } from "@/server/db/auth.repository"
import { closeDatabase, database } from "@/server/db/client"
import { stores } from "@/server/db/schema"
import { uuidv7 } from "@/server/db/uuid"
import { db as fixtures, resetFixtures } from "@/server/fixtures/store"
import { fixtureAtomic } from "@/server/fixtures/atomic"
import { DomainError } from "@/server/shared/errors"
import { connect, engines } from "./connections"

const secret = "authentication-contract-private-key-at-least-32-characters"
const password = "Distinct sample account secret 76!"
const meta = { ip: "127.0.0.91", userAgent: "Auth contract", requestId: "contract" }

for (const [engine, configuration] of [["fixtures", null] as const, ...engines] as const) describe(engine + " full identity service contract", () => {
  const fixture = engine === "fixtures", storeId = uuidv7()
  const customerActor = systemActor(storeId, "auth:customer", ALL_PERMISSIONS), staffActor = systemActor(storeId, "auth:staff", ALL_PERMISSIONS), worker = systemActor(storeId, "migration", ALL_PERMISSIONS)
  const customers: CustomerOperations = bindActor<CustomerOperations>(fixture ? createFixturesCustomerRepository() : createMysqlCustomerRepository(), () => customerActor)
  const staffRepo: AdminOperations = bindActor<AdminOperations>(fixture ? createFixturesAdminRepository() : createMysqlAdminRepository(), () => staffActor)
  const platform: PlatformOperations = bindActor<PlatformOperations>(fixture ? createFixturesPlatformRepository() : createMysqlPlatformRepository(), () => worker)
  const extra = fixture ? createFixturesCustomerAuthRepository() : createMysqlCustomerAuthRepository()
  const atomic = <T>(actor: Actor, operation: () => Promise<T>) => fixture ? fixtureAtomic(operation) : authTransaction(actor, operation)
  let at = Date.now(), customerSequence = 0, failAudit = false
  const customerService = createCustomerService({
    customers, atomic: (operation) => atomic(customerActor, operation),
    auth: { repository: extra, actor: () => customerActor, magicLinkEnabled: true, verificationEnabled: true },
    orders: { listForCustomer: async () => [], anonymiseCustomer: async () => 0 },
    publish: (topic, payload) => platform.enqueue(storeId, topic, sealDeliveryPayload(payload, secret)),
    securityEvent: (customer, action) => platform.audit({ storeId, actor: customer.id, action, entity: "customer", entityId: customer.id, before: null, after: null }),
    rehashPassword: fixture ? undefined : (customer, value) => rehashCustomerPassword(customerActor, customer.id, customer.passwordHash, value),
  })
  const staff = createAdminService({
    repo: staffRepo, secret, clock: () => at, atomic: (operation) => atomic(staffActor, operation),
    hit: (key, seconds) => platform.hit(storeId + ":" + key, seconds),
    audit: async (entry) => { if (failAudit) throw new Error("Simulated durable audit failure"); await platform.audit(entry) },
    notifySecurity: (email, action) => platform.enqueue(storeId, "auth.security_changed", { email, action }).then(() => undefined),
    rehashPassword: fixture ? undefined : (member, value) => rehashStaffPassword(staffActor, member.userId, member.passwordHash!, value),
  })
  const register = async () => customerService.register(storeId, { email: `customer${++customerSequence}@example.test`, password, fullName: "Auth Customer", marketingOptIn: false })
  const ownerEmail = "identity-owner@example.test", inviteToken = newToken()
  let ownerToken = "", ownerTotp = "", recoveryCodes: string[] = []
  beforeAll(async () => {
    if (fixture) { resetFixtures(); fixtures().stores[0].id = storeId }
    else { await closeDatabase(); process.env.DATABASE_URL = configuration!.appUrl; await (await database()).insert(stores).values({ id: storeId, name: "Identity contract" }) }
    await staff.ensureRegistry(storeId)
    await staffRepo.createInvite({ id: uuidv7(), storeId, email: ownerEmail, roleKey: "owner", tokenHash: hashToken(inviteToken), invitedBy: null, createdAt: new Date(at).toISOString(), expiresAt: new Date(at + 3_600_000).toISOString(), acceptedAt: null, revokedAt: null })
  })
  afterAll(async () => {
    if (!fixture) {
      const cleanup = await connect(configuration!.migratorUrl)
      try {
        const id = Buffer.from(storeId.replaceAll("-", ""), "hex")
        await cleanup.execute("DELETE FROM staff_roles WHERE store_id = ?", [id])
        await cleanup.execute("DELETE FROM stores WHERE id = ?", [id])
      }
      finally { await cleanup.end(); await closeDatabase() }
    }
  })

  it("stores scrypt credentials and hashed opaque customer sessions, without accepting them in the staff realm", async () => {
    const result = await register(), customer = await customers.findById(result.customer.id)
    expect(customer?.passwordHash).toMatch(/^scrypt\$32768\$8\$3\$/)
    expect(JSON.stringify(customer)).not.toContain(password)
    expect(await customers.findSession(hashToken(result.session.token))).toMatchObject({ customerId: result.customer.id })
    expect(await customers.findSession(result.session.token)).toBeNull()
    expect((await customerService.fromSession(result.session.token))?.id).toBe(result.customer.id)
    expect(await staff.resolve(result.session.token)).toBeNull()
    expect(await customerService.fromSession("unknown")).toBeNull()
  })

  it("persists temporary customer lockout and gives one error for wrong, unknown and locked identities", async () => {
    const account = await register()
    for (let attempt = 0; attempt < 5; attempt++) await expect(customerService.login(storeId, account.customer.email, "Wrong password" )).rejects.toMatchObject({ code: "unauthorized", message: "That email and password don't match." })
    await expect(customerService.login(storeId, account.customer.email, password)).rejects.toMatchObject({ code: "unauthorized", message: "That email and password don't match." })
    await expect(customerService.login(storeId, "unknown@example.test", password)).rejects.toMatchObject({ code: "unauthorized", message: "That email and password don't match." })
    expect(await extra.security(customerActor, account.customer.id)).toMatchObject({ failedLogins: 5, lockedUntil: expect.any(String) })
  })

  it("keeps reset links encrypted in the delivery queue and accepts a reset exactly once under contention", async () => {
    const account = await register()
    await customerService.requestPasswordReset(storeId, account.customer.email)
    const event = (await platform.claimDue(100)).find((row) => row.topic === "password.reset_requested" && row.payload.email === account.customer.email)!
    expect(event.payload.token).toBeUndefined()
    const token = String(openDeliveryPayload(event.payload, secret).token)
    expect(JSON.stringify(event.payload)).not.toContain(token)
    const results = await Promise.allSettled([customerService.resetPassword(token, password + "changed"), customerService.resetPassword(token, password + "changed")])
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1)
    expect(await customerService.fromSession(account.session.token)).toBeNull()
    await expect(customerService.resetPassword(token, password)).rejects.toMatchObject({ code: "validation" })
  })

  it("rolls token consumption back if the credential write fails", async () => {
    const account = await register(), token = newToken()
    await customers.createReset({ tokenHash: hashToken(token), customerId: account.customer.id, expiresAt: new Date(Date.now() + 60_000).toISOString(), usedAt: null })
    const faulty = createCustomerService({ customers: { ...customers, update: async () => { throw new Error("Simulated credential write failure") } }, atomic: (operation) => atomic(customerActor, operation), publish: async () => undefined, orders: { listForCustomer: async () => [], anonymiseCustomer: async () => 0 } })
    await expect(faulty.resetPassword(token, password + "next")).rejects.toThrow("Simulated credential write failure")
    expect(await customerService.resetPassword(token, password + "next")).toMatchObject({ token: expect.any(String) })
  })

  it("requires browser binding for magic sign-in and allows a proof only once", async () => {
    const account = await register(), nonce = newToken()
    await customerService.requestMagicLink(storeId, account.customer.email, nonce)
    const event = (await platform.claimDue(100)).find((row) => row.topic === "auth.link_requested" && row.payload.email === account.customer.email)!
    const token = String(openDeliveryPayload(event.payload, secret).token)
    await expect(customerService.redeemLink(token, "magic_link", newToken())).rejects.toMatchObject({ code: "validation" })
    expect(await customerService.redeemLink(token, "magic_link", nonce)).toMatchObject({ customer: { id: account.customer.id }, session: { token: expect.any(String) } })
    await expect(customerService.redeemLink(token, "magic_link", nonce)).rejects.toMatchObject({ code: "validation" })
  })

  it("verifies email without creating a login and invalidates old email proofs after a reauthenticated change", async () => {
    const account = await register()
    await customerService.requestVerification(storeId, account.customer.email)
    const event = (await platform.claimDue(100)).find((row) => row.topic === "auth.link_requested" && row.payload.email === account.customer.email)!
    const token = String(openDeliveryPayload(event.payload, secret).token)
    expect((await customerService.redeemLink(token, "verify_email")).session).toBeNull()
    expect((await extra.security(customerActor, account.customer.id)).emailVerifiedAt).toBeTruthy()
    const customer = (await customers.findById(account.customer.id))!
    await expect(customerService.changeEmail(customer, "wrong", "new@example.test")).rejects.toMatchObject({ code: "validation" })
    await customerService.changeEmail(customer, password, "new@example.test")
    expect((await extra.security(customerActor, account.customer.id)).emailVerifiedAt).toBeNull()
    expect(await customerService.fromSession(account.session.token)).toBeNull()
  })

  it("lets a customer list/revoke their sessions and denies another customer's token or store", async () => {
    const account = await register(), customer = (await customers.findById(account.customer.id))!
    const own: Actor = { kind: "customer", id: customer.id, email: customer.email, storeId, permissions: [], mfaVerifiedAt: null }
    const sessions = await extra.sessions(own, customer.id, hashToken(account.session.token))
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ current: true, id: hashToken(account.session.token) })
    const other: Actor = { ...own, id: uuidv7() }
    await expect(extra.sessions(other, customer.id, "")).rejects.toMatchObject({ code: "forbidden" })
    await expect(extra.revokeSession(other, customer.id, sessions[0].id)).rejects.toMatchObject({ code: "forbidden" })
    await extra.revokeSession(own, customer.id, sessions[0].id)
    expect(await customerService.fromSession(account.session.token)).toBeNull()
  })

  it("accepts a pre-assigned staff invite exactly once, even with simultaneous submissions", async () => {
    const results = await Promise.allSettled([staff.acceptInvite(inviteToken, { displayName: "Owner", password }, meta), staff.acceptInvite(inviteToken, { displayName: "Owner", password }, meta)])
    const accepted = results.filter((row) => row.status === "fulfilled")
    expect(accepted).toHaveLength(1)
    if (accepted[0].status !== "fulfilled") throw new Error("Invite did not produce a session")
    ownerToken = accepted[0].value.token
    expect(accepted[0].value).toMatchObject({ aal: 1, needs: "enrol" })
    expect((await staff.resolve(ownerToken))?.roles.map((role) => role.key)).toEqual(["owner"])
    expect(await customerService.fromSession(ownerToken)).toBeNull()
  })

  it("rolls enrolment back when its required audit fails, then rotates AAL1 to AAL2 exactly once", async () => {
    const enrolment = await staff.beginEnrolment(ownerToken)
    ownerTotp = enrolment.secret
    const code = totpAt(ownerTotp, at)
    failAudit = true
    await expect(staff.confirmEnrolment(ownerToken, code, meta)).rejects.toThrow("Simulated durable audit failure")
    failAudit = false
    expect((await staff.resolve(ownerToken))?.session.aal).toBe(1)
    const results = await Promise.allSettled([staff.confirmEnrolment(ownerToken, code, meta), staff.confirmEnrolment(ownerToken, code, meta)])
    const accepted = results.filter((row) => row.status === "fulfilled")
    expect(accepted).toHaveLength(1)
    if (accepted[0].status !== "fulfilled") throw new Error("Enrolment did not produce a session")
    expect(accepted[0].value.session.token).not.toBe(ownerToken)
    expect(await staff.resolve(ownerToken)).toBeNull()
    ownerToken = accepted[0].value.session.token; recoveryCodes = accepted[0].value.recoveryCodes
    expect((await staff.resolve(ownerToken))?.session).toMatchObject({ aal: 2, mfaAt: new Date(at).toISOString() })
  })

  it("consumes a recovery code once across two simultaneous pending sessions", async () => {
    const first = await staff.login(storeId, ownerEmail, password, meta), second = await staff.login(storeId, ownerEmail, password, meta)
    const outcomes = await Promise.allSettled([staff.verifyMfa(first.token, recoveryCodes[0], meta), staff.verifyMfa(second.token, recoveryCodes[0], meta)])
    expect(outcomes.filter((row) => row.status === "fulfilled")).toHaveLength(1)
    expect((await staffRepo.findMemberByEmail(storeId, ownerEmail))?.recoveryCodes).toHaveLength(9)
  })

  it("rotates the password session, ends all old sessions and preserves actual MFA freshness", async () => {
    const context = (await staff.resolve(ownerToken))!
    const proofAt = context.session.mfaAt
    at += 60_000
    const session = await staff.changePassword(context, password, password + "rotated", meta)
    expect(session.token).not.toBe(ownerToken)
    expect(await staff.resolve(ownerToken)).toBeNull()
    expect((await staff.resolve(session.token))?.session.mfaAt).toBe(proofAt)
    await expect(staff.login(storeId, ownerEmail, password, meta)).rejects.toMatchObject({ code: "unauthorized" })
    expect((await staff.login(storeId, ownerEmail, password + "rotated", meta)).aal).toBe(1)
    ownerToken = session.token
  })

  it("rejects assurance without an enrolled factor at the raw repository boundary", async () => {
    const userId = uuidv7(), now = new Date(at).toISOString()
    await staffRepo.createMember({ userId, storeId, email: "unenrolled@example.test", displayName: "Unenrolled", status: "active", passwordHash: null, totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [], failedLogins: 0, lockedUntil: null, lastSeenAt: null, createdAt: now, updatedAt: now })
    await expect(staffRepo.createSession({ id: uuidv7(), userId, storeId, tokenHash: hashToken(newToken()), aal: 2, mfaAt: now, createdAt: now, lastSeenAt: now, expiresAt: new Date(at + 60_000).toISOString(), revokedAt: null, ip: null, userAgent: null })).rejects.toBeInstanceOf(DomainError)
  })

  it("refuses stale customer credential proofs after another password change", async () => {
    const account = await register(), customer = (await customers.findById(account.customer.id))!
    await customerService.changePassword(customer, password, password + "current")
    await expect(customerService.changeEmail(customer, password, "stale@example.test")).rejects.toMatchObject({ code: "unauthorized" })
    await expect(customerService.deleteAccount(customer, password)).rejects.toMatchObject({ code: "unauthorized" })
    expect((await customers.findById(customer.id))?.email).toBe(account.customer.email)
  })

  it("lists more staff than the pool queue limit without one role query per member", async () => {
    const created: StaffMember[] = []
    for (let index = 0; index < 251; index++) created.push(await staffRepo.createMember({ userId: uuidv7(), storeId, email: `directory-${index}@example.test`, displayName: `Directory ${index}`, status: "invited", passwordHash: null, totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [], failedLogins: 0, lockedUntil: null, lastSeenAt: null, createdAt: new Date(at).toISOString(), updatedAt: new Date(at).toISOString() }))
    await staffRepo.setRoles(storeId, created[0].userId, ["support_agent", "read_only"])
    const context: StaffContext = { member: created[0], session: { id: uuidv7(), aal: 2, mfaAt: new Date(at).toISOString(), createdAt: new Date(at).toISOString(), expiresAt: new Date(at + 60_000).toISOString() }, roles: [], permissions: ["staff:read"], refundLimit: 0 }
    const summaries = await staff.listStaff(context), assigned = summaries.find((row) => row.userId === created[0].userId)!
    expect(created.every((member) => summaries.some((row) => row.userId === member.userId))).toBe(true)
    expect(assigned.roles).toEqual((await staffRepo.rolesOf(storeId, created[0].userId)).map(({ key, name }) => ({ key, name })))
    expect(summaries.find((row) => row.userId === created[1].userId)?.roles).toEqual([])
    expect(JSON.stringify(summaries)).not.toMatch(/passwordHash|totpSecret|recoveryCodes/)
    const assignments = await staffRepo.listRoleAssignments(storeId)
    for (const role of await staff.listRoles(context)) expect(role.members).toBe(assignments.filter((link) => link.roleId === role.id).length)
    await expect(staff.listStaff({ ...context, permissions: [] })).rejects.toMatchObject({ code: "forbidden" })
    await expect(staffRepo.listRoleAssignments(uuidv7())).rejects.toMatchObject({ code: "forbidden" })
    await expect(staff.invite({ ...context, permissions: ALL_PERMISSIONS }, { email: created[0].email, roleKey: "read_only" }, meta)).rejects.toMatchObject({ code: "conflict" })
    const invited = await staff.invite({ ...context, permissions: ALL_PERMISSIONS }, { email: "directory-invite@example.test", roleKey: "read_only" }, meta)
    expect(invited.path).toMatch(/^\/admin\/invite\//)
  })

  it("keeps new security notifications durable alongside the credential change", async () => {
    const events = await platform.claimDue(100)
    expect(events.some((event) => event.topic === "auth.security_changed")).toBe(true)
    if (fixture) expect(fixtures().audit.some((entry) => entry.action === "staff.password_changed")).toBe(true)
  })

  it("scopes expiring OAuth state to its browser/store and never stores a plaintext verifier", async () => {
    const state = newToken(), browser = newToken(), proof = "v1.sealed-provider-proof"
    await extra.saveOAuthState(customerActor, { tokenHash: hashToken(state), storeId, browserHash: hashToken(browser), sealedProof: proof, expiresAt: new Date(Date.now() + 60_000).toISOString() })
    expect(await extra.takeOAuthState(customerActor, hashToken(state), hashToken("wrong"))).toBeNull()
    expect(await extra.takeOAuthState(systemActor(uuidv7(), "auth:customer"), hashToken(state), hashToken(browser))).toBeNull()
    const results = await Promise.all([extra.takeOAuthState(customerActor, hashToken(state), hashToken(browser)), extra.takeOAuthState(customerActor, hashToken(state), hashToken(browser))])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(results.find(Boolean)?.sealedProof).toBe(proof)
    await extra.saveOAuthState(customerActor, { tokenHash: hashToken(state + "expired"), storeId, browserHash: hashToken(browser), sealedProof: proof, expiresAt: new Date(Date.now() - 1000).toISOString() })
    expect(await extra.takeOAuthState(customerActor, hashToken(state + "expired"), hashToken(browser))).toBeNull()
  })

  it("uses stable provider subjects and requires an existing-account proof before linking by email", async () => {
    const provider = hashToken(storeId).slice(0, 30), subject = uuidv7(), email = "oidc-new@example.test"
    const input = { provider, subject, email, fullName: "OIDC Customer", linkedCustomerId: null }
    const first = await customerService.fromVerifiedOAuth(input), second = await customerService.fromVerifiedOAuth(input)
    expect(first.customer.id).toBe(second.customer.id)
    expect(first.session.token).not.toBe(second.session.token)
    expect((await customers.findById(first.customer.id))?.passwordHash).toBe("")
    expect((await extra.security(customerActor, first.customer.id)).emailVerifiedAt).toBeTruthy()
    const account = await register(), link = { ...input, subject: uuidv7(), email: account.customer.email }
    await expect(customerService.fromVerifiedOAuth(link)).rejects.toMatchObject({ code: "conflict" })
    expect((await customerService.fromVerifiedOAuth({ ...link, linkedCustomerId: account.customer.id })).customer.id).toBe(account.customer.id)
    expect(await extra.oauthCustomer(systemActor(uuidv7(), "auth:customer"), provider, subject)).toBeNull()
    await customers.scrub(first.customer.id)
    expect(await extra.oauthCustomer(customerActor, provider, subject)).toBeNull()
    expect(await customerService.fromSession(second.session.token)).toBeNull()
  })
})
