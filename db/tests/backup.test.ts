import fs from "node:fs/promises"
import path from "node:path"
import { createHash, randomBytes } from "node:crypto"
import { expect, it } from "vitest"
import { backupConnection, backupDatabase, restoreDatabase } from "../../scripts/database-backup.mjs"
import { engines } from "./connections"
import { isolatedDatabase } from "./isolated-database"

const digest = (source: string) => createHash("sha256").update(source).digest("hex")

for (const [engine] of engines) it(engine + " backup restores binary IDs, defaults, JSON and generated guards; refuses corruption/overwrite and rolls back failures", async () => {
  const source = await isolatedDatabase(engine), target = await isolatedDatabase(engine)
  const read = await backupConnection(source.migratorUrl), write = await backupConnection(target.migratorUrl)
  const directory = path.resolve(".data/backup-test-" + randomBytes(8).toString("hex"))
  await fs.mkdir(directory, { mode: 0o700 })
  try {
    const id = Buffer.alloc(16, 17), customer = Buffer.alloc(16, 34), address = Buffer.alloc(16, 51)
    const text = "Quoted ' \\ ; -- line\nSole Drop café 👟 اردو"
    await read.execute("INSERT INTO stores (id,name,next_order_number,created_at) VALUES (?,?,?,?)", [id, text, "9007199254740990", "2025-03-04 05:06:07.123"])
    await read.execute("INSERT INTO customers (id,store_id,email,password_hash,full_name) VALUES (?,?,?,?,?)", [customer, id, "backup@example.test", "fake-test-hash", text])
    await read.execute("INSERT INTO addresses (id,customer_id,full_name,phone,line1,city,province,is_default) VALUES (?,?,?,?,?,?,?,1)", [address, customer, text, "03000000000", text, "Karachi", "Sindh"])
    await read.execute("INSERT INTO audit_log (id,actor,action,entity,entity_id,`before`,`after`,store_id) VALUES (?,?,?,?,?,?,?,?)", [Buffer.alloc(16, 68), "test", "backup", "test", "test", null, JSON.stringify({ text, nested: [true, null, 1499900] }), id])
    const reviewImageKey = "reviews/" + id.toString("hex") + "/sample/0.webp"
    await read.execute("INSERT INTO customer_reviews (id,store_id,display_name,email,rating,title,body,image_keys,status) VALUES (?,?,?,?,?,?,?,?,?)", [Buffer.alloc(16, 77), id, "Reviewer", "reviewer@example.test", 5, "Great pair", "The photos and size guide matched exactly.", JSON.stringify([reviewImageKey]), "approved"])
    const file = path.join(directory, "data.sql"), snapshot = await backupDatabase(read, file)
    const sql = await fs.readFile(file, "utf8")
    expect(snapshot.sha256).toBe(digest(sql))
    expect(snapshot.counts.stores).toBe(1)
    expect(snapshot.reviewImagePaths).toEqual([reviewImageKey])
    expect(sql).not.toContain("default_customer")
    expect(sql).not.toContain(text)
    await expect(restoreDatabase(write, file, "f".repeat(64))).rejects.toThrow("checksum mismatch")
    const invalid = sql.replace("COMMIT;", "INSERT INTO `stores` (`id`,`name`,`next_order_number`) VALUES\n(X'55555555555555555555555555555555',CONVERT(X'74657374' USING utf8mb4),-1);\nCOMMIT;")
    const invalidFile = path.join(directory, "invalid.sql"); await fs.writeFile(invalidFile, invalid)
    await expect(restoreDatabase(write, invalidFile, digest(invalid))).rejects.toThrow()
    const [empty] = await write.query("SELECT id FROM stores")
    expect(empty).toEqual([])
    await restoreDatabase(write, file, snapshot.sha256)
    for (const table of ["stores", "customers", "addresses", "audit_log", "customer_reviews", "schema_migrations"]) {
      const [before] = await read.query("SELECT * FROM `" + table + "`")
      const [after] = await write.query("SELECT * FROM `" + table + "`")
      expect(after).toEqual(before)
    }
    await expect(restoreDatabase(write, file, snapshot.sha256)).rejects.toThrow("nonempty table")
    await expect(backupDatabase(read, file)).rejects.toMatchObject({ code: "EEXIST" })
  } finally {
    await read.end(); await write.end()
    await source.remove(); await target.remove()
    if (!directory.startsWith(path.resolve(".data") + path.sep)) throw new Error("Invalid backup test cleanup")
    await fs.rm(directory, { recursive: true, force: true })
  }
})
