// SWAP → none: talks to the real BFF (`app/api/admin/auth/*`).
import { request } from "@/api/http"

export type SignInNext = "enrol" | "verify" | null

export const adminAuthApi = {
  login: (input: { email: string; password: string }) => request<{ needs: SignInNext }>("/api/admin/auth/login", { method: "POST", body: input }),
  acceptInvite: (token: string, input: { displayName: string; password: string }) =>
    request<{ needs: SignInNext }>(`/api/admin/auth/invite/${encodeURIComponent(token)}`, { method: "POST", body: input }),
  beginEnrolment: () => request<{ secret: string; uri: string; qr: string }>("/api/admin/auth/mfa/setup", { method: "POST" }),
  confirmEnrolment: (code: string) => request<{ recoveryCodes: string[] }>("/api/admin/auth/mfa/confirm", { method: "POST", body: { code } }),
  verify: (code: string) => request<{ ok: true }>("/api/admin/auth/mfa/verify", { method: "POST", body: { code } }),
  stepUp: (code: string) => request<{ ok: true }>("/api/admin/auth/step-up", { method: "POST", body: { code } }),
  logout: () => request<void>("/api/admin/auth/logout", { method: "POST" }),
}
