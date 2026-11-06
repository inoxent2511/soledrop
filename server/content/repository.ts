import type { ContactMessage, Faq, NewsletterSubscriber, Page } from "@/server/content/types"

export interface ContentRepository {
  listPages(storeId: string): Promise<Page[]>
  getPage(storeId: string, slug: string): Promise<Page | null>
  listFaqs(storeId: string): Promise<Faq[]>
  /** Upsert by email; returns true when the address is newly subscribed. */
  subscribe(storeId: string, subscriber: NewsletterSubscriber): Promise<boolean>
  unsubscribe(storeId: string, email: string): Promise<void>
  saveContactMessage(storeId: string, message: ContactMessage): Promise<void>

  // ─── Staff (admin A7) ─────────────────────────────────────────────────────
  /** Every page, drafts included. */
  staffPages(storeId: string): Promise<Page[]>
  staffPage(storeId: string, slug: string): Promise<Page | null>
  /** Creates or updates by slug (renaming when `previousSlug` differs); refuses a stale save. */
  savePage(storeId: string, page: Page, previousSlug: string | null, expectedUpdatedAt: string | null): Promise<Page>
  deletePage(storeId: string, slug: string): Promise<void>
  saveFaq(storeId: string, faq: Faq): Promise<Faq>
  deleteFaq(storeId: string, id: string): Promise<void>
  /** Sets positions in the given order. */
  reorderFaqs(storeId: string, ids: string[]): Promise<void>
}
