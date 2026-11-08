import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { Connection, RowDataPacket } from "mysql2/promise"
import { connect, engines } from "./connections"
import { migrate } from "../../scripts/migrate.mjs"
import { migrationFiles, supportedEngine } from "../../scripts/database-common.mjs"
import { uuidToBytes } from "../../server/db/uuid"
import { appendOnlyTables } from "../../scripts/db-grants.mjs"

for (const [engine, config] of engines) describe(engine + " foundation", () => {
  let admin: Connection
  let app: Connection
  beforeAll(async () => { admin = await connect(config.migratorUrl); app = await connect(config.appUrl) })
  afterAll(async () => { await admin?.end(); await app?.end() })

  it("runs and replays migrations without changing the ledger", async () => {
    expect((await migrate(admin)).engine).toBe(engine)
    expect((await migrate(admin)).migrations).toBe((await migrationFiles()).length)
  })

  it("enforces checksum immutability before executing pending SQL", async () => {
    const [rows] = await admin.query<RowDataPacket[]>("SELECT name, checksum FROM schema_migrations ORDER BY name LIMIT 1")
    const row = rows[0]
    await admin.execute("UPDATE schema_migrations SET checksum = ? WHERE name = ?", ["0".repeat(64), row.name])
    try { await expect(migrate(admin)).rejects.toThrow("checksum changed") }
    finally { await admin.execute("UPDATE schema_migrations SET checksum = ? WHERE name = ?", [row.checksum, row.name]) }
    expect((await migrate(admin)).engine).toBe(engine)
  })

  it("serializes competing migrators with a connection-owned advisory lock", async () => {
    const second = await connect(config.migratorUrl)
    const [[row]] = await admin.query<RowDataPacket[]>("SELECT DATABASE() AS name")
    const name = "soledrop:migrations:" + row.name
    await admin.execute("SELECT GET_LOCK(?, 1)", [name])
    try { await expect(migrate(second, { lockTimeout: 0 })).rejects.toThrow("lock unavailable") }
    finally { await admin.execute("SELECT RELEASE_LOCK(?)", [name]); await second.end() }
    expect((await migrate(admin)).engine).toBe(engine)
  })

  it("uses strict UTC repeatable-read connections", async () => {
    const [[row]] = await app.query<RowDataPacket[]>("SELECT @@session.time_zone AS zone, @@session.sql_mode AS mode")
    expect(row.zone).toBe("+00:00")
    expect(row.mode).toContain("STRICT_TRANS_TABLES")
    await expect(app.query("INSERT INTO rate_limits (`key`, window_start, count) VALUES ('invalid-date-test', 'not-a-date', 1)")).rejects.toMatchObject({ code: "ER_TRUNCATED_WRONG_VALUE" })
  })

  it("preserves every legacy table and adds normalized projections", async () => {
    const [rows] = await app.query<RowDataPacket[]>("SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")
    expect(rows.length).toBeGreaterThanOrEqual(73)
    for (const row of rows) { expect(row.engine).toBe("InnoDB"); expect(row.collation).toBe("utf8mb4_unicode_ci") }
    const names = rows.map((row) => row.name)
    for (const name of ["staff_members", "order_notes", "storefront_content", "audit_log", "product_attribute_values", "search_terms", "order_number_sequences", "auth_tokens", "staff_recovery_codes"]) expect(names).toContain(name)
  })

  it("denies application DDL and audit mutation while permitting append", async () => {
    await expect(app.query("CREATE TABLE should_never_exist (id INT)")).rejects.toMatchObject({ code: "ER_TABLEACCESS_DENIED_ERROR" })
    await expect(app.query("UPDATE audit_log SET action = 'tampered' WHERE 1 = 0")).rejects.toMatchObject({ code: "ER_TABLEACCESS_DENIED_ERROR" })
    await expect(app.query("DELETE FROM audit_log WHERE 1 = 0")).rejects.toMatchObject({ code: "ER_TABLEACCESS_DENIED_ERROR" })
    await app.beginTransaction()
    try {
      await app.execute("INSERT INTO audit_log (id, actor, action, entity, entity_id) VALUES (?, 'test', 'schema.test', 'schema', 'test')", [uuidToBytes(randomUUID())])
    } finally { await app.rollback() }
  })

  it.each(appendOnlyTables)("denies runtime UPDATE and DELETE on append-only %s", async (table) => {
    if (!/^[a-z_]+$/.test(table)) throw new Error("Invalid probe identifier")
    await expect(app.query("UPDATE `" + table + "` SET id = id WHERE 1 = 0")).rejects.toMatchObject({ code: "ER_TABLEACCESS_DENIED_ERROR" })
    await expect(app.query("DELETE FROM `" + table + "` WHERE 1 = 0")).rejects.toMatchObject({ code: "ER_TABLEACCESS_DENIED_ERROR" })
  })

  it("enforces CHECKs, UUID byte length, money safety, normalization and foreign keys", async () => {
    await app.beginTransaction()
    const store = uuidToBytes(randomUUID()), brand = uuidToBytes(randomUUID()), product = uuidToBytes(randomUUID()), variant = uuidToBytes(randomUUID())
    try {
      await app.execute("INSERT INTO stores (id, name) VALUES (?, 'Schema probe')", [store])
      await expect(app.execute("INSERT INTO brands (id, store_id, slug, name) VALUES (?, ?, 'UPPER', 'Invalid')", [brand, store])).rejects.toBeDefined()
      await app.execute("INSERT INTO brands (id, store_id, slug, name) VALUES (?, ?, 'schema-probe', 'Schema')", [brand, store])
      await app.execute("INSERT INTO products (id, store_id, slug, title, brand_id, kind, gender) VALUES (?, ?, 'schema-probe', 'Schema', ?, 'new', 'unisex')", [product, store, brand])
      await app.execute("INSERT INTO variants (id, product_id, sku, size_eu, size_uk, size_us, size_cm) VALUES (?, ?, ?, '42', '8', '9', '27')", [variant, product, randomUUID()])
      await expect(app.execute("INSERT INTO inventory_levels (variant_id, on_hand, reserved) VALUES (?, -1, 0)", [variant])).rejects.toBeDefined()
      await expect(app.execute("INSERT INTO inventory_levels (variant_id, on_hand, reserved) VALUES (?, 1, 2)", [variant])).rejects.toBeDefined()
      await expect(app.execute("INSERT INTO stores (id, name, next_order_number) VALUES (?, 'Invalid', 9007199254740992)", [uuidToBytes(randomUUID())])).rejects.toBeDefined()
      await expect(app.execute("INSERT INTO inventory_levels (variant_id, on_hand, reserved) VALUES (?, 1, 0)", [uuidToBytes(randomUUID())])).rejects.toMatchObject({ code: "ER_NO_REFERENCED_ROW_2" })
      const [[row]] = await app.execute<RowDataPacket[]>("SELECT OCTET_LENGTH(id) AS bytes FROM products WHERE id = ?", [product])
      expect(Number(row.bytes)).toBe(16)
    } finally { await app.rollback() }
  })

  it("reports actual server identity and migration objects", async () => {
    const [[row]] = await app.query<RowDataPacket[]>("SELECT VERSION() AS version, @@version_comment AS comment")
    expect(supportedEngine(row.version, row.comment).engine).toBe(engine)
    const [[counts]] = await app.query<RowDataPacket[]>("SELECT (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()) AS constraints_count, (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND SEQ_IN_INDEX = 1) AS indexes_count")
    expect(Number(counts.constraints_count)).toBeGreaterThan(250)
    expect(Number(counts.indexes_count)).toBeGreaterThan(120)
  })
})
