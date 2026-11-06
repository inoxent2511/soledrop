import "server-only"

import type { FaqInput, PageInput } from "@/features/admin/content/schema"
import type { Permission } from "@/server/admin/permissions"
import type { RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import type { ContentRepository } from "@/server/content/repository"
import type { Page } from "@/server/content/types"
import { DomainError } from "@/server/shared/errors"
import { newId, now } from "@/server/shared/ids"

/**
 * Staff content (admin A7): block pages under /pages/<slug> and the FAQs. Saving keeps a page's
 * published state; publishing is its own permission. The policy pages (Terms, Privacy, Shipping,
 * Returns) are designed documents kept in code (content/*.ts, A-017) and are not edited here.
 */

type Audit = (staff: StaffContext, meta: RequestMeta, entry: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown; reason?: string | null; storeId: string }) => Promise<void>

const need = (staff: StaffContext, permission: Permission) => {
  if (!staff.permissions.includes(permission)) throw new DomainError("forbidden", "You don't have permission to do that.", { permission })
}

/** Slugs the storefront routes elsewhere (app/(store)/pages/[slug] redirects them to the designed pages). */
export const RESERVED_PAGE_SLUGS = ["terms", "privacy-policy", "shipping", "returns"]

export function createStaffContent(deps: { content: ContentRepository; audit: Audit; revalidate: () => void }) {
  const { content } = deps

  async function load(staff: StaffContext, slug: string) {
    const page = await content.staffPage(staff.member.storeId, slug)
    if (!page) throw new DomainError("not_found", "Page not found.")
    return page
  }

  return {
    async pages(staff: StaffContext) {
      need(staff, "content:read")
      return (await content.staffPages(staff.member.storeId)).sort((a, b) => a.title.localeCompare(b.title))
    },

    page: async (staff: StaffContext, slug: string) => {
      need(staff, "content:read")
      return load(staff, slug)
    },

    async savePage(staff: StaffContext, meta: RequestMeta, input: PageInput, options: { previousSlug?: string; expectedUpdatedAt?: string }) {
      need(staff, "content:write")
      if (RESERVED_PAGE_SLUGS.includes(input.slug)) throw new DomainError("validation", "That address belongs to a policy page. Choose another.")
      const before = options.previousSlug ? await load(staff, options.previousSlug) : null
      const page: Page = { ...input, updatedAt: before?.updatedAt ?? now(), published: before?.published ?? false }
      const saved = await content.savePage(staff.member.storeId, page, options.previousSlug ?? null, options.expectedUpdatedAt ?? null)
      await deps.audit(staff, meta, {
        action: before ? "page.updated" : "page.created",
        entity: "page",
        entityId: saved.slug,
        before: before ? { slug: before.slug, title: before.title, blocks: before.blocks.length } : undefined,
        after: { slug: saved.slug, title: saved.title, blocks: saved.blocks.length },
        storeId: staff.member.storeId,
      })
      deps.revalidate()
      return saved
    },

    async setPublished(staff: StaffContext, meta: RequestMeta, slug: string, published: boolean) {
      need(staff, "content:publish")
      const before = await load(staff, slug)
      const saved = await content.savePage(staff.member.storeId, { ...before, published }, slug, before.updatedAt)
      await deps.audit(staff, meta, { action: published ? "page.published" : "page.unpublished", entity: "page", entityId: slug, before: { published: before.published }, after: { published }, storeId: staff.member.storeId })
      deps.revalidate()
      return saved
    },

    async deletePage(staff: StaffContext, meta: RequestMeta, slug: string) {
      need(staff, "content:publish")
      const before = await load(staff, slug)
      await content.deletePage(staff.member.storeId, slug)
      await deps.audit(staff, meta, { action: "page.deleted", entity: "page", entityId: slug, before: { title: before.title }, storeId: staff.member.storeId })
      deps.revalidate()
    },

    async faqs(staff: StaffContext) {
      need(staff, "content:read")
      return content.listFaqs(staff.member.storeId)
    },

    /** FAQs go live as soon as they are saved (the FAQ page has no drafts), so this needs content:publish. */
    async saveFaq(staff: StaffContext, meta: RequestMeta, input: FaqInput, id?: string) {
      need(staff, "content:publish")
      const faqs = await content.listFaqs(staff.member.storeId)
      const before = id ? faqs.find((faq) => faq.id === id) : undefined
      if (id && !before) throw new DomainError("not_found", "Question not found.")
      const saved = await content.saveFaq(staff.member.storeId, { id: before?.id ?? newId(), position: before?.position ?? faqs.length, ...input })
      await deps.audit(staff, meta, { action: before ? "faq.updated" : "faq.created", entity: "faq", entityId: saved.id, before, after: saved, storeId: staff.member.storeId })
      deps.revalidate()
      return saved
    },

    async deleteFaq(staff: StaffContext, meta: RequestMeta, id: string) {
      need(staff, "content:publish")
      const before = (await content.listFaqs(staff.member.storeId)).find((faq) => faq.id === id)
      if (!before) throw new DomainError("not_found", "Question not found.")
      await content.deleteFaq(staff.member.storeId, id)
      await deps.audit(staff, meta, { action: "faq.deleted", entity: "faq", entityId: id, before, storeId: staff.member.storeId })
      deps.revalidate()
    },

    async reorderFaqs(staff: StaffContext, meta: RequestMeta, ids: string[]) {
      need(staff, "content:publish")
      const known = new Set((await content.listFaqs(staff.member.storeId)).map((faq) => faq.id))
      if (ids.length !== known.size || ids.some((id) => !known.has(id))) throw new DomainError("validation", "The list changed. Reload and try again.")
      await content.reorderFaqs(staff.member.storeId, ids)
      await deps.audit(staff, meta, { action: "faq.reordered", entity: "faq", entityId: "*", after: { order: ids }, storeId: staff.member.storeId })
      deps.revalidate()
    },
  }
}

export type StaffContent = ReturnType<typeof createStaffContent>
