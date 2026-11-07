import { randomBytes } from "node:crypto"
import { customType } from "drizzle-orm/mysql-core"

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
let previousMillisecond = -1
let sequence = 0

/** Monotonic RFC 9562 UUIDv7; legacy canonical UUIDs remain valid import keys. */
export function uuidv7(now = Date.now()): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > 0xffffffffffff) throw new RangeError("Invalid UUID timestamp")
  const millisecond = Math.max(now, previousMillisecond)
  sequence = millisecond === previousMillisecond ? sequence + 1 : randomBytes(2).readUInt16BE() & 0xfff
  if (sequence > 0xfff) return uuidv7(millisecond + 1)
  previousMillisecond = millisecond
  const bytes = randomBytes(16)
  bytes.writeUIntBE(millisecond, 0, 6)
  bytes.writeUInt16BE(0x7000 | sequence, 6)
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return uuidFromBytes(bytes)
}

export function uuidToBytes(value: string): Buffer {
  if (!canonicalUuid.test(value)) throw new TypeError("Expected a canonical UUID")
  return Buffer.from(value.replaceAll("-", ""), "hex")
}

export function uuidFromBytes(value: Uint8Array): string {
  if (value.byteLength !== 16) throw new TypeError("Expected a 16-byte UUID")
  const hex = Buffer.from(value).toString("hex")
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-")
}

export const uuid = customType<{ data: string; driverData: Buffer }>({
  dataType: () => "binary(16)",
  toDriver: uuidToBytes,
  fromDriver: uuidFromBytes,
})
