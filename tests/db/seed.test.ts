import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { commerceSeed } from "@/server/fixtures/commerce-seed"
import { contentSeed } from "@/server/fixtures/content-seed"
import { openingStock, products } from "@/server/fixtures/seed"

import { freshDatabase } from "./harness"
import { seedSql } from "./seed-sql"

const SEED = path.resolve(import.meta.dirname, "../../qa/fixtures/seed.sql")

describe("isolated QA seed SQL", () => {
  it("is generated from the fixtures and up to date", () => {
    const sql = seedSql()
    if (process.env.WRITE_SEED === "1") fs.writeFileSync(SEED, sql)
    expect(fs.existsSync(SEED) ? fs.readFileSync(SEED, "utf8") : "", "run WRITE_SEED=1 vitest run tests/db/seed.test.ts").toBe(sql)
  })

  it("loads into the migrated schema with every row the fixtures driver serves", async () => {
    const db = await freshDatabase()
    await db.exec(seedSql())
    const count = async (table: string, where = "true") => (await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where ${where}`)).rows[0].n
    expect(await count("products")).toBe(products.length)
    expect(await count("variants")).toBe(products.reduce((total, product) => total + product.variants.length, 0))
    expect(await count("inventory_levels", "on_hand > 0")).toBe(openingStock.filter((row) => row.onHand > 0).length)
    expect(await count("promotions")).toBe(commerceSeed.promotions.length)
    expect(await count("pages")).toBe(contentSeed.pages.length)
    expect(await count("product_images", "role = 'card'")).toBeGreaterThan(0)
    await db.close()
  })
})
