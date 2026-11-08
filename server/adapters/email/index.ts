import "server-only"

import { serverEnv } from "@/lib/env.server"
import { createConsoleEmailProvider } from "@/server/adapters/email/console"
import { createFileEmailProvider } from "./file"
import { createSmtpEmailProvider } from "./smtp"
import { platform } from "@/server/platform"
import { DeliveryDeferred } from "@/server/platform/deferred"
import { renderEventEmail } from "@/server/adapters/email/templates"
import type { OutboxEvent } from "@/server/platform/types"

export type EmailMessage = { to: string; subject: string; text: string; html: string; idempotencyKey?: string }

/** An email vendor. Add one by implementing this and registering it below. */
export interface EmailProvider {
  readonly name: string
  send(message: EmailMessage): Promise<{ id: string }>
  verify?: () => Promise<boolean>
}

const providers: Record<string, () => EmailProvider> = {
  console: createConsoleEmailProvider,
  file: () => createFileEmailProvider(serverEnv.EMAIL_OUTBOX_DIR, serverEnv.EMAIL_FROM),
  smtp: () => createSmtpEmailProvider({ host: serverEnv.SMTP_HOST!, port: serverEnv.SMTP_PORT, secure: serverEnv.SMTP_SECURE === "true", user: serverEnv.SMTP_USER, password: serverEnv.SMTP_PASS, from: serverEnv.EMAIL_FROM }),
}

let active: EmailProvider | undefined

/**
 * The default private file sink sends nothing externally. SMTP is enabled explicitly.
 */
export function email() {
  active ??= providers[serverEnv.EMAIL_PROVIDER]()
  return {
    provider: active,
    send: (message: EmailMessage) => active!.send(message),
    async sendForEvent(event: OutboxEvent) {
      const message = renderEventEmail(event)
      if (message) {
        if (serverEnv.EMAIL_PROVIDER === "smtp" && await platform().hit("smtp-hour:" + serverEnv.EMAIL_FROM, 3600) > serverEnv.SMTP_HOURLY_LIMIT) throw new DeliveryDeferred(new Date((Math.floor(Date.now() / 3_600_000) + 1) * 3_600_000 + 1000).toISOString())
        await active!.send({ ...message, idempotencyKey: event.id })
      }
    },
  }
}
