import { describe, expect, it, vi } from "vitest"
import { GET } from "@/app/media/[file]/route"

const file = vi.hoisted(() => vi.fn())
vi.mock("@/server/media", () => ({ mediaService: () => ({ file }) }))
const id = "00000000-0000-4000-8000-000000000001", params = { params: Promise.resolve({ file: id + ".webp" }) }
describe("prepared public media HTTP contract", () => {
  it("serves a negotiated variant with a strong ETag and honours conditional requests", async () => {
    file.mockResolvedValue({ item: { id }, data: new Uint8Array([1, 2, 3]), mime: "image/avif" })
    const response = await GET(new Request("http://127.0.0.1:3200/media/" + id + ".webp?w=640", { headers: { accept: "image/avif,image/webp" } }), params)
    expect(file).toHaveBeenLastCalledWith(id, { width: 640, format: "avif" })
    expect(response.headers.get("content-type")).toBe("image/avif")
    expect(response.headers.get("vary")).toBe("Accept")
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
    expect(response.headers.get("etag")).toMatch(/^"[0-9a-f]{64}"$/)
    const cached = await GET(new Request("http://127.0.0.1:3200/media/" + id + ".webp?w=640", { headers: { accept: "image/avif", "if-none-match": response.headers.get("etag")! } }), params)
    expect(cached.status).toBe(304)
    expect((await cached.arrayBuffer()).byteLength).toBe(0)
  })
  it("rejects arbitrary resize widths and does not negotiate a format explicitly refused by the browser", async () => {
    file.mockClear()
    expect((await GET(new Request("http://127.0.0.1:3200/media/" + id + ".webp?w=999999"), params)).status).toBe(400)
    expect(file).not.toHaveBeenCalled()
    await GET(new Request("http://127.0.0.1:3200/media/" + id + ".webp?w=640", { headers: { accept: "image/avif;q=0,image/webp" } }), params)
    expect(file).toHaveBeenLastCalledWith(id, { width: 640, format: "webp" })
  })
  it("keeps legacy URLs separate from the exact-width v2 variants", async () => {
    file.mockClear()
    expect((await GET(new Request("http://127.0.0.1:3200/media/" + id + ".webp?w=828&v=1"), params)).status).toBe(400)
    expect((await GET(new Request("http://127.0.0.1:3200/media/" + id + ".webp?w=640&v=3"), params)).status).toBe(400)
    expect(file).not.toHaveBeenCalled()
    file.mockResolvedValue({ item: { id }, data: new Uint8Array([4, 5, 6]), mime: "image/webp" })
    expect((await GET(new Request("http://127.0.0.1:3200/media/" + id + ".webp?w=828&v=2", { headers: { accept: "image/webp" } }), params)).status).toBe(200)
    expect(file).toHaveBeenLastCalledWith(id, { width: 828, format: "webp", version: 2 })
  })
})
