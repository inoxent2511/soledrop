import type { Role, StaffInvite, StaffMember, StaffSession } from "@/server/admin/types"
import type { CartRow } from "@/server/cart/types"
import type { AttributeDefinition, Brand, Collection, CustomFieldDefinition, Product } from "@/server/catalog/types"
import type { ContactMessage, Faq, NewsletterSubscriber, Page } from "@/server/content/types"
import type { Customer, CustomerAddress, PasswordReset, Session, StaffRole } from "@/server/customers/types"
import type { Order, Payment, Refund, ReturnRequest } from "@/server/orders/types"
import type { AuditEntry, FeatureFlag, OutboxEvent, WebhookDelivery } from "@/server/platform/types"
import type { ExchangeRates, PriceList, PriceRow } from "@/server/pricing/types"
import type { Promotion, PromotionRedemption } from "@/server/promotions/types"
import type { SearchEvent, SynonymGroup } from "@/server/search/types"
import type { ShippingZone, TaxRate } from "@/server/shipping/types"
import type { CurrencyCode } from "@/server/shared/money"

export type InventoryRow = { variantId: string; onHand: number; reserved: number }
export type ReservationRow = { id: string; cartId: string; variantId: string; quantity: number; expiresAt: string }

/** Shape of the fixtures database — one property per Postgres table (docs/app/data-model.md). */
export type FixtureTables = {
  stores: { id: string; slug: string; name: string; defaultCurrency: CurrencyCode; defaultLocale: string }[]
  brands: Brand[]
  products: Product[]
  collections: Collection[]
  attributeDefinitions: AttributeDefinition[]
  customFieldDefinitions: CustomFieldDefinition[]
  priceLists: PriceList[]
  prices: PriceRow[]
  inventory: InventoryRow[]
  reservations: ReservationRow[]
  carts: CartRow[]
  promotions: Promotion[]
  promotionRedemptions: PromotionRedemption[]
  shippingZones: ShippingZone[]
  taxRates: TaxRate[]
  orders: Order[]
  payments: Payment[]
  refunds: Refund[]
  returns: ReturnRequest[]
  orderSequence: { prefix: string; next: number }
  customers: Customer[]
  addresses: CustomerAddress[]
  sessions: Session[]
  passwordResets: PasswordReset[]
  staffRoles: StaffRole[]
  /** Admin identity and RBAC (phase 2, A-001/A-007). */
  staffMembers: StaffMember[]
  adminPermissions: { key: string; label: string; group: string; sensitive: boolean }[]
  adminRoles: Role[]
  staffRoleLinks: { userId: string; storeId: string; roleId: string }[]
  staffInvites: StaffInvite[]
  staffSessions: StaffSession[]
  pages: Page[]
  faqs: Faq[]
  newsletter: NewsletterSubscriber[]
  contactMessages: ContactMessage[]
  searchSynonyms: SynonymGroup[]
  searchEvents: SearchEvent[]
  flags: FeatureFlag[]
  outbox: OutboxEvent[]
  webhookDeliveries: WebhookDelivery[]
  audit: AuditEntry[]
  rateLimits: Map<string, { windowStart: number; count: number }>
  idempotency: Map<string, { status: number; body: unknown; at: number }>
  exchangeRates: ExchangeRates
}
