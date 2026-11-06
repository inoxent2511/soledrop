import fs from "node:fs"

import { expect, test } from "@playwright/test"

/**
 * The image optimiser must actually run in the standalone build: when sharp's native libraries are
 * missing it falls back to serving each original, multi-megabyte photo (BUG-016).
 */
const PHOTOS = ["/images/site/hero-2.jpg", "/images/products/asics-gel-kayano-30-card.png"]

for (const photo of PHOTOS) {
  test(`/_next/image resizes and re-encodes ${photo}`, async ({ request }) => {
    const original = fs.statSync(`qa/fixtures${photo}`).size
    const response = await request.get(`/_next/image?url=${encodeURIComponent(photo)}&w=828&q=75`, { headers: { accept: "image/avif,image/webp,*/*" } })
    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toMatch(/^image\/(avif|webp)$/)
    const body = await response.body()
    // An 828 px rendition is a small fraction of the source photo.
    expect(body.byteLength).toBeLessThan(Math.min(original / 4, 250 * 1024))
  })
}
