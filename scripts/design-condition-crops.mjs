#!/usr/bin/env node
/**
 * Cuts the five illustrations out of the exported "Sneaker Condition Guide Cards 1" raster
 * (public/images/site/condition-guide.png, placed at 124,477 on screen 03) so the guide can be
 * rebuilt as real text (D-015). Card bounds were measured from the design PNG; each crop is the
 * card's artwork band above its title. Re-run after re-exporting the raster.
 */
import fs from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const sharp = require("../node_modules/.pnpm/sharp@0.35.5_@types+node@20.19.43/node_modules/sharp")

const SOURCE = "public/images/site/condition-guide.png"
const ORIGIN = { x: 124, y: 477 }
const BAND = { top: 841, bottom: 1016 }
const cards = [
  ["like-new", 168, 474],
  ["premium", 490, 793],
  ["excellent", 808, 1112],
  ["very-good", 1128, 1431],
  ["minor-issue", 1447, 1752],
]

if (!fs.existsSync(SOURCE)) throw new Error(`missing ${SOURCE} — run scripts/design-export-photos.mjs first`)
for (const [grade, left, right] of cards) {
  const out = `public/images/site/condition-${grade}.png`
  await sharp(SOURCE)
    .extract({ left: left - ORIGIN.x, top: BAND.top - ORIGIN.y, width: right - left + 1, height: BAND.bottom - BAND.top })
    .png({ compressionLevel: 9 })
    .toFile(out)
  console.log(`wrote ${out}`)
}
