import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"
import { uuidv7, uuidToBytes } from "@/server/db/uuid"
import { connect, engines } from "./connections"

const execute = promisify(execFile)

for (const [engine, configuration] of engines) describe(engine + " Owner CLI bootstrap", () => {
  it("prints one expiring link, stores its hash, replaces unused links and refuses an existing Owner", async () => {
    const db = await connect(configuration.migratorUrl), storeId = uuidv7(), storeKey = uuidToBytes(storeId)
    const environment = { ...process.env, DATA_DRIVER: "mysql", DATABASE_URL: configuration.appUrl, STORE_ID: storeId, AUTH_SECRET: "bootstrap-test-private-secret-at-least-32-characters", NEXT_PUBLIC_SITE_URL: "https://store.example.test" }
    const run = () => execute(process.execPath, ["scripts/create-owner.mjs", "--email", "bootstrap@example.test"], { env: environment, windowsHide: true, timeout: 20_000 })
    try {
      await db.execute("INSERT INTO stores (id, name) VALUES (?, ?)", [storeKey, "Owner bootstrap contract"])
      const first = await run(), link = /https:\/\/store\.example\.test\/admin\/invite\/([A-Za-z0-9_-]{43})/.exec(first.stdout)
      expect(link).not.toBeNull()
      const token = link![1], digest = createHash("sha256").update(token).digest("hex")
      const [rows] = await db.execute("SELECT token_hash, expires_at, revoked_at FROM staff_invites WHERE store_id = ?", [storeKey])
      expect(JSON.stringify(rows)).toContain(digest)
      expect(JSON.stringify(rows)).not.toContain(token)
      expect(first.stdout).not.toContain("password:")
      await run()
      const [[count]] = await db.query("SELECT COUNT(*) AS live FROM staff_invites WHERE store_id = ? AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > UTC_TIMESTAMP(3)", [storeKey]) as unknown as [[{ live: number }], unknown]
      expect(Number(count.live)).toBe(1)
      const userId = uuidToBytes(uuidv7())
      await db.execute("INSERT INTO staff_members (user_id, store_id, email, display_name, status) VALUES (?, ?, ?, ?, ?)", [userId, storeKey, "existing-owner@example.test", "Existing Owner", "active"])
      await db.execute("INSERT INTO staff_roles (user_id, store_id, role_id) SELECT ?, ?, id FROM roles WHERE store_id = ? AND `key` = ?", [userId, storeKey, storeKey, "owner"])
      await expect(run()).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("active Owner already exists") })
    } finally {
      await db.execute("DELETE FROM staff_roles WHERE store_id = ?", [storeKey])
      await db.execute("DELETE FROM stores WHERE id = ?", [storeKey])
      await db.end()
    }
  })

  it("rejects a remote database before creating a connection", async () => {
    await expect(execute(process.execPath, ["scripts/create-owner.mjs", "--email", "bootstrap@example.test"], { env: { ...process.env, DATA_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@remote.invalid/never_contacted" }, windowsHide: true, timeout: 10_000 })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("only connects to a loopback database") })
  })
})
