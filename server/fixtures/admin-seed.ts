import { createHash } from "node:crypto"

import { seal } from "@/server/admin/crypto"
import { ALL_PERMISSIONS, PERMISSIONS, PRESET_ROLES, isSensitive } from "@/server/admin/permissions"
import { base32Encode } from "@/server/admin/totp"
import type { Role, StaffMember } from "@/server/admin/types"
import { STORE_ID } from "@/server/fixtures/seed"

/**
 * Admin fixtures (A-007, A-011): the permission registry and system roles for the fixtures store,
 * and, only with ADMIN_DEMO_STAFF=on, one DEMO staff member per preset role so the admin can be
 * run and tested without a database. Demo accounts are never created with the real database
 * (env validation refuses it).
 */

/** The demo password for every demo account (local and e2e only). */
export const DEMO_STAFF_PASSWORD = "Demo-Staff-2026!"
const DEMO_PASSWORD_HASH = "scrypt$16384$8$1$DloLhvO4gJM38j1jbAOZ9w$14M_vX0hfx43ZgFYoUbXU-GR-sgdca3tR8Z1jMKX-JfrD0J0IprYe1_7aATH115VdHmMFQpnEa3dJy47zwhEMw"

/** Each demo account's TOTP secret, derived from its role so tests can compute codes. */
export const demoTotpSecret = (roleKey: string): string => base32Encode(createHash("sha1").update(`soledrop-demo-${roleKey}`).digest())
export const demoEmail = (roleKey: string): string => `${roleKey.replace(/_/g, "-")}@demo.soledrop.local`

const roleId = (index: number) => `90000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
const demoUserId = (index: number) => `91000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
const seededAt = "2026-11-07T00:00:00.000Z"

export const adminPermissionRows = () =>
  ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSIONS[key].label, group: PERMISSIONS[key].group, sensitive: isSensitive(key) }))

export const adminSystemRoles = (): Role[] =>
  PRESET_ROLES.map((preset, index) => ({
    id: roleId(index),
    storeId: STORE_ID,
    key: preset.key,
    name: preset.name,
    description: preset.description,
    isSystem: true,
    refundLimit: preset.refundLimit,
    permissions: [...preset.permissions],
    createdAt: seededAt,
    updatedAt: seededAt,
  }))

/** One DEMO member per preset role, MFA already enrolled with `demoTotpSecret(role)`. */
export function demoStaff(sealSecret: string): { members: StaffMember[]; links: { userId: string; storeId: string; roleId: string }[] } {
  const members = PRESET_ROLES.map((preset, index) => ({
    userId: demoUserId(index),
    storeId: STORE_ID,
    email: demoEmail(preset.key),
    displayName: `DEMO ${preset.name}`,
    status: "active" as const,
    passwordHash: DEMO_PASSWORD_HASH,
    totpSecret: seal(demoTotpSecret(preset.key), sealSecret),
    totpEnabledAt: seededAt,
    totpLastStep: null,
    recoveryCodes: [],
    failedLogins: 0,
    lockedUntil: null,
    lastSeenAt: null,
    createdAt: seededAt,
    updatedAt: seededAt,
  }))
  const links = PRESET_ROLES.map((_, index) => ({ userId: demoUserId(index), storeId: STORE_ID, roleId: roleId(index) }))
  return { members, links }
}
