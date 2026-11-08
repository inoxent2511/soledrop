import "server-only"

import { createHash, createHmac, randomUUID } from "node:crypto"
import type { StorageAdapter } from "./types"
import { DomainError } from "@/server/shared/errors"

const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex")
const hmac = (key: Uint8Array | string, value: string) => createHmac("sha256", key).update(value).digest()
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (character) => "%" + character.charCodeAt(0).toString(16).toUpperCase())
type Credentials = { accessKey: string; secretKey: string; region: string }
type S3Options = Credentials & { endpoint: string; bucket: string }

/** AWS SigV4, signed payloads. Kept independently testable against the published AWS vector. */
export function signS3Headers(method: string, url: URL, data: Uint8Array, credentials: Credentials, extra: Record<string, string> = {}, at = new Date()) {
  const date = at.toISOString().replace(/[:-]|\.\d{3}/g, ""), day = date.slice(0, 8), payload = hash(data)
  const headers: Record<string, string> = { ...extra, host: url.host, "x-amz-content-sha256": payload, "x-amz-date": date }
  const names = Object.keys(headers).sort(), signed = names.join(";")
  const query = [...url.searchParams].map(([key, value]) => [encode(key), encode(value)]).sort(([a, av], [b, bv]) => { const x = a === b ? av : a, y = a === b ? bv : b; return x < y ? -1 : x > y ? 1 : 0 }).map(([key, value]) => key + "=" + value).join("&")
  const canonical = [method, url.pathname, query, names.map((name) => name.toLowerCase() + ":" + headers[name].trim().replace(/\s+/g, " ") + "\n").join(""), signed, payload].join("\n")
  const scope = day + "/" + credentials.region + "/s3/aws4_request"
  const key = hmac(hmac(hmac(hmac("AWS4" + credentials.secretKey, day), credentials.region), "s3"), "aws4_request")
  const signature = hmac(key, ["AWS4-HMAC-SHA256", date, scope, hash(canonical)].join("\n")).toString("hex")
  return { ...headers, authorization: "AWS4-HMAC-SHA256 Credential=" + credentials.accessKey + "/" + scope + ",SignedHeaders=" + signed + ",Signature=" + signature }
}

/** Optional path-style S3/R2 reference. Private buckets remain behind application routes. */
export class S3Storage implements StorageAdapter {
  private readonly endpoint: URL
  private readonly options: S3Options
  private readonly request: typeof fetch
  constructor(options: S3Options, request: typeof fetch = fetch) {
    this.options = options; this.request = request
    this.endpoint = new URL(options.endpoint)
    if (this.endpoint.protocol !== "https:" || this.endpoint.username || this.endpoint.password || this.endpoint.pathname !== "/" || this.endpoint.search || this.endpoint.hash || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(options.bucket)) throw new Error("S3 requires an HTTPS origin and a valid bucket")
  }
  private async send(method: string, key: string, data: Uint8Array = new Uint8Array(), extra: Record<string, string> = {}) {
    if (!key || key.length > 512 || /[\\\x00-\x1f]/.test(key) || key.split("/").some((part) => !part || part === "." || part === "..")) throw new DomainError("validation", "Invalid storage key.")
    const url = new URL("/" + this.options.bucket + "/" + key.split("/").map(encode).join("/"), this.endpoint)
    try {
      return await this.request(url, { method, headers: signS3Headers(method, url, data, this.options, extra), ...(method === "PUT" ? { body: Buffer.from(data) } : {}), redirect: "error", signal: AbortSignal.timeout(15_000) })
    } catch { throw new DomainError("unavailable", "Object storage is unavailable.") }
  }
  async put(key: string, data: Uint8Array) {
    const response = await this.send("PUT", key, data, { "if-none-match": "*" })
    if (response.status === 412) {
      const previous = await this.get(key)
      if (!previous || previous.etag !== hash(data)) throw new DomainError("conflict", "An immutable storage key already exists.")
    } else if (!response.ok) throw new DomainError("unavailable", "Object storage rejected the upload.")
    return { etag: hash(data) }
  }
  async get(key: string) {
    const response = await this.send("GET", key)
    if (response.status === 404) return null
    if (!response.ok) throw new DomainError("unavailable", "Object storage read failed.")
    const data = new Uint8Array(await response.arrayBuffer())
    return { data, etag: hash(data) }
  }
  async remove(key: string) { const response = await this.send("DELETE", key); if (!response.ok && response.status !== 404) throw new DomainError("unavailable", "Object storage delete failed.") }
  async writable() {
    const key = "probes/" + randomUUID()
    try { await this.put(key, new Uint8Array()); await this.remove(key); return true } catch { return false }
  }
}
