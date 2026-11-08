import "server-only"

import { createHash } from "node:crypto"
import nodemailer from "nodemailer"
import type { EmailProvider } from "./index"

export type SmtpOptions = { host: string; port: number; secure: boolean; user?: string; password?: string; from: string; allowInsecureLoopback?: boolean }
export const messageId = (key: string) => "<" + createHash("sha256").update(key).digest("hex") + "@soledrop.mail>"

/** STARTTLS is required on submission ports; test-only plaintext is confined to loopback. */
export function createSmtpEmailProvider(options: SmtpOptions): EmailProvider {
  if (options.allowInsecureLoopback && !["127.0.0.1", "localhost", "::1"].includes(options.host)) throw new Error("Plain SMTP is allowed only for local tests")
  const transport = nodemailer.createTransport({
    host: options.host, port: options.port, secure: options.secure,
    auth: options.user ? { user: options.user, pass: options.password } : undefined,
    requireTLS: !options.secure && !options.allowInsecureLoopback,
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000,
    disableFileAccess: true, disableUrlAccess: true,
  })
  return {
    name: "smtp",
    verify: async () => { await transport.verify(); return true },
    async send(message) {
      const info = await transport.sendMail({ from: options.from, ...message, ...(message.idempotencyKey ? { messageId: messageId(message.idempotencyKey) } : {}) })
      if (!info.accepted.length) throw new Error("SMTP did not accept the recipient")
      return { id: info.messageId }
    },
  }
}
