import { createHash, randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { expect, it } from "vitest"

import { backupUploads, verifyUploads } from "../../scripts/backup-uploads.mjs"

it("backs up customer review photos without asking for product image variants", async () => {
  const root = path.resolve(".data/review-backup-test-" + randomBytes(8).toString("hex"))
  const source = path.join(root, "source"), target = path.join(root, "target")
  const key = "reviews/test-store/test-review/0.webp"
  const hash = createHash("sha256").update(key).digest("hex")
  const relative = path.join(hash.slice(0, 2), hash)
  const bytes = Buffer.from("test review image")
  try {
    await fs.mkdir(path.dirname(path.join(source, relative)), { recursive: true })
    await fs.writeFile(path.join(source, relative), bytes)
    const backup = await backupUploads(source, target, [], [key])
    expect(backup.originals).toBe(1)
    expect(backup.files).toHaveLength(1)
    expect(await fs.readFile(path.join(target, relative))).toEqual(bytes)
    expect(await verifyUploads(target, backup)).toEqual({ originals: 1, files: 1 })
  } finally {
    if (!root.startsWith(path.resolve(".data") + path.sep)) throw new Error("Invalid task-owned test cleanup")
    await fs.rm(root, { recursive: true, force: true })
  }
})
