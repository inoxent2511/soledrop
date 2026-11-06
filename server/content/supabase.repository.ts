import "server-only"

import type { ContentRepository } from "@/server/content/repository"
import type { Faq, Page } from "@/server/content/types"
import { supabase, unwrap } from "@/server/db/supabase"
import { DomainError } from "@/server/shared/errors"

type PageRecord = { slug: string; title: string; description: string; blocks: Page["blocks"]; updated_at: string; seo: Page["seo"]; published: boolean }
const toPage = (row: PageRecord): Page => ({ slug: row.slug, title: row.title, description: row.description, blocks: row.blocks, updatedAt: row.updated_at, seo: row.seo, published: row.published })

export function createSupabaseContentRepository(): ContentRepository {
  return {
    async listPages(storeId) {
      const rows = unwrap(await supabase().from("pages").select("*").eq("store_id", storeId).eq("published", true)) as PageRecord[]
      return rows.map(toPage)
    },
    async getPage(storeId, slug) {
      const row = unwrap(await supabase().from("pages").select("*").eq("store_id", storeId).eq("slug", slug).eq("published", true).maybeSingle()) as PageRecord | null
      return row ? toPage(row) : null
    },
    async listFaqs(storeId) {
      return unwrap(await supabase().from("faqs").select("id, category, question, answer, position").eq("store_id", storeId).order("position")) as Faq[]
    },
    async subscribe(storeId, subscriber) {
      return unwrap(
        await supabase().rpc("subscribe_newsletter", { p_store_id: storeId, p_email: subscriber.email, p_source: subscriber.source }),
      ) as boolean
    },
    async unsubscribe(storeId, email) {
      unwrap(await supabase().from("newsletter_subscribers").update({ status: "unsubscribed" }).eq("store_id", storeId).eq("email", email))
    },
    async saveContactMessage(storeId, message) {
      unwrap(
        await supabase().from("contact_messages").insert({
          id: message.id,
          store_id: storeId,
          name: message.name,
          email: message.email,
          order_number: message.orderNumber,
          message: message.message,
        }),
      )
    },

    async staffPages(storeId) {
      const rows = unwrap(await supabase().from("pages").select("*").eq("store_id", storeId).order("title")) as PageRecord[]
      return rows.map(toPage)
    },
    async staffPage(storeId, slug) {
      const row = unwrap(await supabase().from("pages").select("*").eq("store_id", storeId).eq("slug", slug).maybeSingle()) as PageRecord | null
      return row ? toPage(row) : null
    },
    async savePage(storeId, page, previousSlug, expectedUpdatedAt) {
      unwrap(
        await supabase().rpc("save_page", {
          p_store_id: storeId,
          p_previous_slug: previousSlug,
          p_page: { slug: page.slug, title: page.title, description: page.description, blocks: page.blocks, seo: page.seo, published: page.published !== false },
          p_expected_updated_at: expectedUpdatedAt,
        }),
      )
      const saved = await this.staffPage(storeId, page.slug)
      if (!saved) throw new DomainError("not_found", "Page not found.")
      return saved
    },
    async deletePage(storeId, slug) {
      const rows = unwrap(await supabase().from("pages").delete().eq("store_id", storeId).eq("slug", slug).select("slug")) as { slug: string }[]
      if (!rows.length) throw new DomainError("not_found", "Page not found.")
    },
    async saveFaq(storeId, faq) {
      unwrap(await supabase().from("faqs").upsert({ id: faq.id, store_id: storeId, category: faq.category, question: faq.question, answer: faq.answer, position: faq.position }, { onConflict: "id" }))
      return faq
    },
    async deleteFaq(storeId, id) {
      const rows = unwrap(await supabase().from("faqs").delete().eq("store_id", storeId).eq("id", id).select("id")) as { id: string }[]
      if (!rows.length) throw new DomainError("not_found", "Question not found.")
    },
    async reorderFaqs(storeId, ids) {
      unwrap(await supabase().rpc("reorder_faqs", { p_store_id: storeId, p_ids: ids }))
    },
    async listSubscribers(storeId, query) {
      let request = supabase().from("newsletter_subscribers").select("email, status, source, consent_at", { count: "exact" }).eq("store_id", storeId)
      if (query.status) request = request.eq("status", query.status)
      const start = (query.page - 1) * query.pageSize
      const result = await request.order("consent_at", { ascending: false }).range(start, start + query.pageSize - 1)
      const rows = unwrap(result) as { email: string; status: "subscribed" | "unsubscribed"; source: string; consent_at: string }[]
      return { subscribers: rows.map((row) => ({ email: row.email, status: row.status, source: row.source, consentAt: row.consent_at })), total: result.count ?? rows.length }
    },
  }
}
