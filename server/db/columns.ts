import { customType } from "drizzle-orm/mysql-core"

export const searchDigest = customType<{ data: string; driverData: Buffer }>({
  dataType: () => "binary(32)",
  toDriver(value) { if (!/^[a-f0-9]{64}$/.test(value)) throw new RangeError("Invalid search digest"); return Buffer.from(value, "hex") },
  fromDriver: (value) => value.toString("hex"),
})
export const searchGram = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "varbinary(12)" })

/** mysql2 can return JSON as text on MariaDB and as an object on MySQL. */
export const portableJson = customType<{ data: unknown; driverData: string }>({
  dataType: () => "json",
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) => typeof value === "string" ? JSON.parse(value) as unknown : value,
})

/** Minor units and counters never silently lose precision in JavaScript. */
export const safeBigint = customType<{ data: number; driverData: string }>({
  dataType: () => "bigint",
  toDriver(value) {
    if (!Number.isSafeInteger(value)) throw new RangeError("Integer exceeds the supported precision")
    return String(value)
  },
  fromDriver(value) {
    const result = Number(value)
    if (!Number.isSafeInteger(result)) throw new RangeError("Database integer exceeds the supported precision")
    return result
  },
})
