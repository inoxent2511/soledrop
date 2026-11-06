import { beforeEach, describe, expect, it } from "vitest"

import { pageInput } from "@/features/admin/content/schema"
import { PRESET_ROLES } from "@/server/admin/permissions"
import { resolvePermissions, type RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import { contentService } from "@/server/content"
import { createFixturesContentRepository } from "@/server/content/fixtures.repository"
import { createStaffContent } from "@/server/content/staff"
import { STORE_ID } from "@/server/fixtures/seed"
import { db, resetFixtures } from "@/server/fixtures/store"

/** Staff pages and FAQs (admin A7) on the fixtures driver. */

const meta: RequestMeta = { ip: "203.0.113.9", userAgent: "vitest", requestId: "req" }
let audits: string[] = []

function staffAs(roleKey: string): StaffContext {
  const role = PRESET_ROLES.find((preset) => preset.key === roleKey)!
  const { permissions, refundLimit } = resolvePermissions([{ permissions: [...role.permissions], refundLimit: role.refundLimit }])
  return {
    member: { userId: `user-${roleKey}`, storeId: STORE_ID, email: `${roleKey}@example.com`, displayName: role.name, status: "active", totpEnabledAt: "2026-01-01T00:00:00Z" },
    session: { id: `s-${roleKey}`, aal: 2, mfaAt: new Date().toISOString(), createdAt: "2026-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z" },
    roles: [{ id: roleKey, key: roleKey, name: role.name, refundLimit: role.refundLimit }],
    permissions,
    refundLimit,
  }
}

const content = () => createStaffContent({ content: createFixturesContentRepository(), audit: async (_s, _m, entry) => void audits.push(entry.action), revalidate: () => undefined })
const page = (slug = "size-help") => pageInput.parse({ slug, title: "Size help", description: "Finding your size", blocks: [{ type: "heading", text: "Measure", level: 2 }, { type: "paragraph", text: "Stand on paper." }], seo: {} })

beforeEach(() => {
  resetFixtures()
  audits = []
})

describe("staff content", () => {
  it("keeps new pages as drafts off the storefront until published", async () => {
    const editor = staffAs("content_editor")
    const draft = await content().savePage(editor, meta, page(), {})
    expect(draft.published).toBe(false)
    expect(await contentService().page(STORE_ID, "size-help")).toBeNull()
    await content().setPublished(editor, meta, "size-help", true)
    expect((await contentService().page(STORE_ID, "size-help"))?.title).toBe("Size help")
    await expect(content().setPublished(staffAs("marketing"), meta, "size-help", false)).rejects.toMatchObject({ code: "forbidden" })
  })

  it("renames safely, refuses stale saves, taken and reserved addresses, and off-site links", async () => {
    const editor = staffAs("content_editor")
    const created = await content().savePage(editor, meta, page(), {})
    // Versions are millisecond timestamps: let the clock move so the rename gets a new one.
    await new Promise((resolve) => setTimeout(resolve, 5))
    const renamed = await content().savePage(editor, meta, page("sizing"), { previousSlug: "size-help", expectedUpdatedAt: created.updatedAt })
    expect(renamed.slug).toBe("sizing")
    await expect(content().savePage(editor, meta, page("sizing"), { previousSlug: "sizing", expectedUpdatedAt: created.updatedAt })).rejects.toMatchObject({ code: "conflict" })
    await expect(content().savePage(editor, meta, page(db().pages[0].slug), {})).rejects.toMatchObject({ code: "conflict" })
    await expect(content().savePage(editor, meta, page("terms"), {})).rejects.toMatchObject({ code: "validation" })
    expect(pageInput.safeParse({ ...page(), blocks: [{ type: "cta", label: "Go", href: "https://evil.example", text: "" }] }).success).toBe(false)
    expect(pageInput.safeParse({ ...page(), blocks: [{ type: "cta", label: "Go", href: "//evil.example", text: "" }] }).success).toBe(false)
    expect(pageInput.safeParse({ ...page(), blocks: [{ type: "cta", label: "Go", href: "/contact", text: "" }] }).success).toBe(true)
  })

  it("adds, edits, reorders and deletes FAQs, live on the FAQ page", async () => {
    const editor = staffAs("content_editor")
    const before = (await contentService().faqs(STORE_ID)).length
    const added = await content().saveFaq(editor, meta, { category: "Delivery", question: "Do you deliver on Sundays?", answer: "Not yet." })
    expect((await contentService().faqs(STORE_ID)).length).toBe(before + 1)
    await content().saveFaq(editor, meta, { category: "Delivery", question: "Do you deliver on Sundays?", answer: "Yes, in Karachi." }, added.id)
    const ids = (await contentService().faqs(STORE_ID)).map((faq) => faq.id)
    await content().reorderFaqs(editor, meta, [added.id, ...ids.filter((id) => id !== added.id)])
    expect((await contentService().faqs(STORE_ID))[0]).toMatchObject({ id: added.id, answer: "Yes, in Karachi." })
    await expect(content().reorderFaqs(editor, meta, [added.id])).rejects.toMatchObject({ code: "validation" })
    await content().deleteFaq(editor, meta, added.id)
    expect((await contentService().faqs(STORE_ID)).length).toBe(before)
    await expect(content().saveFaq(staffAs("marketing"), meta, { category: "X", question: "Is this allowed?", answer: "No" })).rejects.toMatchObject({ code: "forbidden" })
    expect(audits).toEqual(["faq.created", "faq.updated", "faq.reordered", "faq.deleted"])
  })
})
