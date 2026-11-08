import { describe, expect, it, vi } from "vitest"
import { S3Storage, signS3Headers } from "@/server/adapters/storage/s3"

// Published non-secret example credentials and signature from AWS's SigV4 reference.
const credentials = { accessKey: "AKIAIOSFODNN7EXAMPLE", secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1" }
describe("S3/R2 reference adapter", () => {
  it("matches the independent AWS GET Object signature vector exactly", () => {
    const headers = signS3Headers("GET", new URL("https://examplebucket.s3.amazonaws.com/test.txt"), new Uint8Array(), credentials, { range: "bytes=0-9" }, new Date("2013-05-24T00:00:00Z"))
    expect(headers.authorization).toBe("AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41")
  })
  it("signs immutable uploads and encoded paths without sending credentials in URLs", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
    const storage = new S3Storage({ ...credentials, endpoint: "https://objects.example.test", bucket: "private-bucket" }, request)
    await storage.put("store/a b+!.webp", new Uint8Array([1, 2, 3]))
    const [url, options] = request.mock.calls[0]
    expect(String(url)).toBe("https://objects.example.test/private-bucket/store/a%20b%2B%21.webp")
    expect(String(url)).not.toContain(credentials.accessKey)
    expect(options?.headers).toMatchObject({ "if-none-match": "*", authorization: expect.stringContaining("AWS4-HMAC-SHA256") })
    expect(options?.redirect).toBe("error")
    await expect(storage.get("../escape")).rejects.toMatchObject({ code: "validation" })
    expect(() => new S3Storage({ ...credentials, endpoint: "http://objects.example.test", bucket: "private-bucket" }, request)).toThrow("HTTPS")
  })
  it("rejects overwriting different immutable bytes and reports missing/unavailable objects", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 412 })).mockResolvedValueOnce(new Response(new Uint8Array([7]))).mockResolvedValueOnce(new Response(null, { status: 404 })).mockRejectedValueOnce(new Error("offline"))
    const storage = new S3Storage({ ...credentials, endpoint: "https://objects.example.test", bucket: "private-bucket" }, request)
    await expect(storage.put("same-key", new Uint8Array([1]))).rejects.toMatchObject({ code: "conflict" })
    expect(await storage.get("missing")).toBeNull()
    await expect(storage.get("offline")).rejects.toMatchObject({ code: "unavailable" })
  })
})
