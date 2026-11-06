// SWAP → none: talks to the real BFF (`app/api/admin/account/*`).
import { request } from "@/api/http"

export type StaffSessionDto = { id: string; aal: 1 | 2; ip: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string; current: boolean }

export const adminAccountApi = {
  sessions: (signal?: AbortSignal) => request<{ sessions: StaffSessionDto[] }>("/api/admin/account/sessions", { signal }),
  revokeSession: (sessionId: string) => request<void>("/api/admin/account/sessions", { method: "DELETE", body: { sessionId } }),
  signOutEverywhere: () => request<void>("/api/admin/account/sign-out-everywhere", { method: "POST" }),
  changePassword: (input: { currentPassword: string; newPassword: string }) => request<{ ok: true }>("/api/admin/account/password", { method: "POST", body: input }),
  regenerateRecoveryCodes: () => request<{ recoveryCodes: string[] }>("/api/admin/account/recovery-codes", { method: "POST" }),
}
