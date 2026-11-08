import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PRESET_ROLES } from "@/server/admin/permissions"
import type { StaffContext } from "@/server/admin/types"
import { adminRoute, type AdminAccess } from "@/server/admin/route"
import { DomainError } from "@/server/shared/errors"
import { fixtureStaff } from "@/tests/helpers/staff"
import { resetFixtures } from "@/server/fixtures/store"

const identity = vi.hoisted(() => ({ staff: null as StaffContext | null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))
vi.mock("@/server/admin", () => ({ adminService: () => ({
  resolve: async () => identity.staff,
  assertSteppedUp: (staff: StaffContext) => {
    if (!staff.session.mfaAt || Date.parse(staff.session.mfaAt) + 600_000 < Date.now()) throw new DomainError("forbidden", "Step up", { stepUp: true })
  },
}) }))
vi.mock("@/server/platform", () => ({ platform: () => ({ hit: async () => 1 }) }))
vi.mock("@/server/http/auth-timing", () => ({ finishAuthTiming: async () => {} }))

function declarations(directory: string): { label: string; method: string; access: AdminAccess }[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((file) => {
    const name = path.join(directory, file.name)
    if (file.isDirectory()) return declarations(name)
    if (file.name !== "route.ts") return []
    const source = ts.createSourceFile(name, fs.readFileSync(name, "utf8"), ts.ScriptTarget.Latest, true)
    const result: { label: string; method: string; access: AdminAccess }[] = []
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /^(GET|POST|PUT|PATCH|DELETE)$/.test(node.name.text)) {
        const call = node.initializer
        if (!call || !ts.isCallExpression(call) || call.expression.getText(source) !== "adminRoute") throw new Error(name + " is missing its declared gate")
        const arg = call.arguments[0]
        let access: AdminAccess
        if (ts.isStringLiteral(arg)) access = arg.text as AdminAccess
        else if (ts.isObjectLiteralExpression(arg)) {
          const permission = arg.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(source) === "permission")
          if (!permission || !ts.isPropertyAssignment(permission) || !ts.isStringLiteral(permission.initializer)) throw new Error("Missing permission")
          access = { permission: permission.initializer.text as Exclude<AdminAccess, object | "public" | "pending" | "staff">, stepUp: true }
        } else throw new Error("Unsupported access declaration")
        result.push({ label: name + " " + node.name.text, method: node.name.text, access })
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    return result
  })
}

const handlers = declarations(path.resolve("app/api/admin"))
beforeEach(() => { resetFixtures(); identity.staff = null })
describe("every admin handler's declared DAL gate", () => {
  for (const subject of [...PRESET_ROLES.map((role) => role.key), "customer", "anonymous", "aal1", "stale-mfa"]) {
    it.each(handlers)(subject + " → $label", async ({ method, access }) => {
      const staff = ["customer", "anonymous"].includes(subject) ? null : fixtureStaff(subject === "aal1" || subject === "stale-mfa" ? "owner" : subject, subject !== "stale-mfa")
      if (subject === "aal1" && staff) { staff.session.aal = 1; staff.session.mfaAt = null }
      identity.staff = staff
      const permission = typeof access === "object" ? access.permission : access
      const expected = access === "public" ? 200 : !staff ? 401 : access === "pending" ? 200 : staff.session.aal !== 2 ? 401 : permission !== "staff" && !staff.permissions.includes(permission as StaffContext["permissions"][number]) ? 403 : typeof access === "object" && subject === "stale-mfa" ? 403 : 200
      const called = vi.fn(async () => Response.json({ allowed: true }))
      const run = adminRoute(access as Exclude<AdminAccess, "public">, called)
      const response = await run(new Request("http://127.0.0.1:3200/api/admin/matrix", { method, headers: { origin: "http://127.0.0.1:3200" } }), {})
      expect(response.status).toBe(expected)
      expect(called).toHaveBeenCalledTimes(expected === 200 ? 1 : 0)
      expect(response.headers.get("cache-control")).toBe("private, no-store")
    })
  }
})
