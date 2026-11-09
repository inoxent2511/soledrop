import fs from "node:fs"
import sharp from "sharp"

import { expect } from "@playwright/test"
import { test } from "./support/test"

/**
 * The image optimiser must actually run in the standalone build: when sharp's native libraries are
 * missing it falls back to serving each original, multi-megabyte photo (BUG-016).
 */
const PHOTOS = ["/images/site/hero-2.jpg", "/images/products/asics-gel-kayano-30-card.png"]
const prepared = process.env.QA_MEDIA_FIXTURES_FILE ? JSON.parse(fs.readFileSync(process.env.QA_MEDIA_FIXTURES_FILE, "utf8")) as Record<string, { url: string; originalBytes: number; width: number }> : null

for (const photo of PHOTOS) {
  test(`the production image pipeline resizes and re-encodes ${photo}`, async ({ request }) => {
    if (prepared && !prepared[photo]) throw new Error("Provision the isolated QA media fixture: " + photo)
    const original = prepared?.[photo].originalBytes ?? fs.statSync(`qa/fixtures${photo}`).size
    const url = prepared?.[photo].url ?? `/_next/image?url=${encodeURIComponent(photo)}&w=828&q=75`
    const response = await request.get(url, { headers: { accept: "image/avif,image/webp,*/*" } })
    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toMatch(/^image\/(avif|webp)$/)
    const body = await response.body()
    // An 828 px rendition is a small fraction of the source photo.
    expect(body.byteLength).toBeLessThan(Math.min(original / 4, 250 * 1024))
    if (prepared) expect((await sharp(body).metadata()).width).toBe(prepared[photo].width)
  })
}
