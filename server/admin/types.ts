import type { Permission } from "@/server/admin/permissions"

export type StaffStatus = "invited" | "active" | "suspended"

/** A staff member (A-001). Secrets (password hash, TOTP secret, recovery codes) never leave the server. */
export type StaffMember = {
  userId: string
  storeId: string
  email: string
  displayName: string
  status: StaffStatus
  passwordHash: string | null
  /** AES-256-GCM sealed TOTP secret; null until MFA is enrolled. */
  totpSecret: string | null
  totpEnabledAt: string | null
  /** The last TOTP time step accepted, so the same code can't be replayed. */
  totpLastStep: number | null
  /** sha256 of each unused recovery code. */
  recoveryCodes: string[]
  failedLogins: number
  lockedUntil: string | null
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

export type Role = {
  id: string
  storeId: string
  key: string
  name: string
  description: string
  isSystem: boolean
  /** Highest single refund in minor units; null = no ceiling. */
  refundLimit: number | null
  permissions: Permission[]
  createdAt: string
  updatedAt: string
}

export type StaffInvite = {
  id: string
  storeId: string
  email: string
  roleKey: string
  tokenHash: string
  invitedBy: string | null
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
  createdAt: string
}

/** Authenticator assurance: 1 = password only (can only finish MFA), 2 = password + second factor. */
export type Aal = 1 | 2

export type StaffSession = {
  id: string
  userId: string
  storeId: string
  tokenHash: string
  aal: Aal
  /** When the second factor was last proven on this session (step-up window, A-003). */
  mfaAt: string | null
  ip: string | null
  userAgent: string | null
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  revokedAt: string | null
}

/** Everything a request knows about the signed-in staff member, resolved once per request. */
export type StaffContext = {
  member: Pick<StaffMember, "userId" | "storeId" | "email" | "displayName" | "status" | "totpEnabledAt">
  session: Pick<StaffSession, "id" | "aal" | "mfaAt" | "createdAt" | "expiresAt">
  roles: Pick<Role, "id" | "key" | "name" | "refundLimit">[]
  permissions: Permission[]
  /** Highest refund any of the member's roles allows (null = unlimited). */
  refundLimit: number | null
}

/** A staff member as the admin UI shows them: no secrets. */
export type StaffSummary = {
  userId: string
  email: string
  displayName: string
  status: StaffStatus
  mfa: boolean
  roles: { key: string; name: string }[]
  lastSeenAt: string | null
  createdAt: string
}
