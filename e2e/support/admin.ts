import { createHash } from "node:crypto"
import fs from "node:fs"

import { expect, test, type Page } from "@playwright/test"

import { base32Encode, totpAt } from "../../server/admin/totp"

/**
 * DEMO staff (ADMIN_DEMO_STAFF=on, served by qa/serve.mjs; server/fixtures/admin-seed.ts, A-011).
 * Each role has its own account; a TOTP code works once per 30-second step per account, so a
 * second sign-in within the same step waits for the next one.
 */
type QaCredentials = { origin: string; password: string; accounts: Record<string, Record<string, { email: string; secret: string }>> }
const qaCredentials = process.env.QA_STAFF_FILE ? JSON.parse(fs.readFileSync(process.env.QA_STAFF_FILE, "utf8")) as QaCredentials : null
function qaAccount(role: string) {
  if (!qaCredentials) return null
  const info = test.info(), origin = new URL(String(info.project.use.baseURL)).origin, url = new URL(origin)
  if (origin !== qaCredentials.origin || url.hostname !== "127.0.0.1") throw new Error("Private QA staff can only sign in to their isolated loopback server")
  const account = qaCredentials.accounts[info.testId]?.[role]
  if (!account) throw new Error("Provision a separate isolated QA identity for this test and role")
  return account
}
export const DEMO_PASSWORD = qaCredentials?.password ?? "Demo-Staff-2026!"
export const demoEmail = (role: string) => qaAccount(role)?.email ?? `${role.replace(/_/g, "-")}@demo.soledrop.local`
const demoSecret = (role: string) => qaAccount(role)?.secret ?? base32Encode(createHash("sha1").update(`soledrop-demo-${role}`).digest())

export const codeFor = (role: string, at = Date.now()) => totpAt(demoSecret(role), at)

/** A fresh client address: the QA server trusts one proxy hop, and staff sign-in is limited per address (A-005). */
export const clientAddress = () => `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`

/** Headers for a direct API call: our own Origin (admin CSRF check) and a fresh address. */
export const staffHeaders = (baseURL: string | undefined) => ({ origin: new URL(baseURL ?? "http://127.0.0.1:3200").origin, "x-forwarded-for": clientAddress() })

/** Signs in through the real forms (password, then authenticator code) and lands on `next`. */
export async function signInAs(page: Page, role: string, next = "/admin") {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": clientAddress() })
  await page.goto(`/admin/login?next=${encodeURIComponent(next)}`)
  await page.getByLabel("Work email").fill(demoEmail(role))
  await page.getByLabel("Password").fill(DEMO_PASSWORD)
  await page.getByRole("button", { name: "Continue" }).click()
  await expect(page).toHaveURL(/\/admin\/mfa\?/)
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByLabel("Authenticator code").fill(codeFor(role))
    await page.getByRole("button", { name: "Verify" }).click()
    const outcome = await Promise.race([
      page.waitForURL((url) => !url.pathname.startsWith("/admin/mfa"), { timeout: 10_000 }).then(() => "in" as const),
      page.getByText("That code didn't work").waitFor({ timeout: 10_000 }).then(() => "refused" as const),
    ])
    if (outcome === "in") return
    // Same step already used by this account: wait for the next 30-second step.
    await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 500)
  }
  throw new Error(`Could not sign in as ${role}`)
}
