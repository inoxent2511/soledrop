import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import type { ContentOperations } from "@/server/content/repository"
import type { Faq } from "@/server/content/types"
import type { EventTopic } from "@/server/platform/types"
import { newId, now } from "@/server/shared/ids"

type Deps = {
  content: ContentOperations
  publish: (topic: EventTopic, payload: Record<string, unknown>) => Promise<unknown>
  secret: string
  verifiedUnsubscribe?: (storeId: string, email: string) => Promise<void>
}

export function createContentService(deps: Deps) {
  const { content } = deps
  /** Unsubscribe links are signed so nobody can unsubscribe someone else. */
  const unsubscribeToken = (email: string) => createHmac("sha256", deps.secret).update(`unsubscribe:${email}`).digest("base64url")

  return {
    pages: (storeId: string) => content.listPages(storeId),
    page: (storeId: string, slug: string) => content.getPage(storeId, slug),
    faqs: (storeId: string) => content.listFaqs(storeId),

    /** FAQs grouped by category, in seeded order. */
    async faqsByCategory(storeId: string) {
      const groups = new Map<string, Faq[]>()
      for (const faq of await content.listFaqs(storeId)) groups.set(faq.category, [...(groups.get(faq.category) ?? []), faq])
      return [...groups].map(([category, items]) => ({ category, items }))
    },

    async subscribe(storeId: string, email: string, source: string) {
      const normalised = email.trim().toLowerCase()
      const created = await content.subscribe(storeId, { email: normalised, status: "subscribed", source, consentAt: now() })
      if (created) await deps.publish("newsletter.subscribed", { email: normalised, token: unsubscribeToken(normalised) })
      return { created }
    },

    async unsubscribe(storeId: string, email: string, token: string) {
      const normalised = email.trim().toLowerCase()
      const expected = Buffer.from(unsubscribeToken(normalised))
      const given = Buffer.from(token)
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false
      await (deps.verifiedUnsubscribe ?? content.unsubscribe)(storeId, normalised)
      return true
    },

    async contact(storeId: string, input: { name: string; email: string; orderNumber?: string; message: string }) {
      const message = {
        id: newId(),
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        orderNumber: input.orderNumber?.trim().toUpperCase() || null,
        message: input.message.trim(),
        createdAt: now(),
      }
      await content.saveContactMessage(storeId, message)
      await deps.publish("contact.received", { id: message.id, name: message.name, email: message.email, orderNumber: message.orderNumber })
      return { id: message.id }
    },
  }
}

export type ContentService = ReturnType<typeof createContentService>
