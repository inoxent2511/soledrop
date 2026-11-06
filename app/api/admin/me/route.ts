import { adminRoute } from "@/server/admin/route"

/** Who is signed in and what they may do (drives the client's permission checks; the server re-checks). */
export const GET = adminRoute("staff", async ({ staff }) =>
  Response.json({
    member: { userId: staff.member.userId, email: staff.member.email, displayName: staff.member.displayName },
    roles: staff.roles.map((role) => ({ key: role.key, name: role.name })),
    permissions: staff.permissions,
    refundLimit: staff.refundLimit,
    session: { expiresAt: staff.session.expiresAt, mfaAt: staff.session.mfaAt },
  }),
)
