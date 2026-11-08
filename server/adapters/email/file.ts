import "server-only"

import fs from "node:fs/promises"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import nodemailer from "nodemailer"
import type { EmailProvider } from "./index"
import { messageId } from "./smtp"

/** Private local MIME sink. Atomic create preserves one file per outbox event across restarts. */
export function createFileEmailProvider(directory: string, from: string): EmailProvider {
  const root = path.resolve(/* turbopackIgnore: true */ directory)
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" })
  return {
    name: "file",
    async verify() {
      const probe = path.join(root, ".probe-" + randomUUID())
      try {
        await fs.mkdir(root, { recursive: true, mode: 0o700 })
        const stat = await fs.lstat(root)
        if (!stat.isDirectory() || stat.isSymbolicLink()) return false
        await fs.writeFile(probe, "", { flag: "wx", mode: 0o600 })
        return true
      } catch { return false }
      finally { await fs.unlink(probe).catch(() => undefined) }
    },
    async send(message) {
      const key = message.idempotencyKey ?? randomUUID(), id = createHash("sha256").update(key).digest("hex")
      await fs.mkdir(root, { recursive: true, mode: 0o700 })
      const target = path.join(root, id + ".eml")
      try { await fs.access(target); return { id } } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error }
      const info = await transport.sendMail({ from, ...message, messageId: messageId(key), disableFileAccess: true, disableUrlAccess: true })
      const temporary = target + "." + randomUUID() + ".tmp"
      try {
        await fs.writeFile(temporary, info.message, { flag: "wx", mode: 0o600 })
        try { await fs.link(temporary, target) } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error }
      } finally { await fs.unlink(temporary).catch(() => undefined) }
      return { id }
    },
  }
}
