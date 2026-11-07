import { mysqlTable, varchar, char, text, int, tinyint, datetime } from "drizzle-orm/mysql-core"
import { uuid } from "./uuid"
import { portableJson, safeBigint } from "./columns"

/** Column mappings; committed db/migrations SQL is the schema source of truth. */
export const auditLog = mysqlTable("audit_log", {
  id: uuid("id").notNull(),
  actor: varchar("actor", { length: 190 }).notNull(),
  action: varchar("action", { length: 190 }).notNull(),
  entity: varchar("entity", { length: 190 }).notNull(),
  entityId: varchar("entity_id", { length: 190 }).notNull(),
  before: portableJson("before"),
  after: portableJson("after"),
  at: datetime("at", { mode: "string", fsp: 3 }).notNull(),
  storeId: uuid("store_id"),
  actorRole: varchar("actor_role", { length: 190 }),
  ip: varchar("ip", { length: 190 }),
  userAgent: text("user_agent"),
  requestId: varchar("request_id", { length: 190 }),
  reason: text("reason"),
})

export const idempotencyKeys = mysqlTable("idempotency_keys", {
  key: varchar("key", { length: 190 }).notNull(),
  status: int("status").notNull(),
  body: portableJson("body"),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  expiresAt: datetime("expires_at", { mode: "string", fsp: 3 }).notNull(),
})

export const permissions = mysqlTable("permissions", {
  key: varchar("key", { length: 190 }).notNull(),
  label: varchar("label", { length: 190 }).notNull(),
  group: varchar("group", { length: 190 }).notNull(),
  sensitive: tinyint("sensitive").notNull(),
})

export const rateLimits = mysqlTable("rate_limits", {
  key: varchar("key", { length: 190 }).notNull(),
  windowStart: datetime("window_start", { mode: "string", fsp: 3 }).notNull(),
  count: int("count").notNull(),
})

export const stores = mysqlTable("stores", {
  id: uuid("id").notNull(),
  name: varchar("name", { length: 190 }).notNull(),
  defaultCurrency: char("default_currency", { length: 3 }).notNull(),
  orderPrefix: varchar("order_prefix", { length: 190 }).notNull(),
  nextOrderNumber: safeBigint("next_order_number").notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
})

export const attributeDefinitions = mysqlTable("attribute_definitions", {
  storeId: uuid("store_id").notNull(),
  code: varchar("code", { length: 190 }).notNull(),
  label: varchar("label", { length: 190 }).notNull(),
  type: varchar("type", { length: 190 }).notNull(),
  scope: varchar("scope", { length: 190 }).notNull(),
  options: portableJson("options"),
  filterable: tinyint("filterable").notNull(),
  position: int("position").notNull(),
})

export const brands = mysqlTable("brands", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  slug: varchar("slug", { length: 190 }).notNull(),
  name: varchar("name", { length: 190 }).notNull(),
  position: int("position").notNull(),
})

export const collections = mysqlTable("collections", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  slug: varchar("slug", { length: 190 }).notNull(),
  title: varchar("title", { length: 190 }).notNull(),
  headline: portableJson("headline").notNull(),
  description: text("description").notNull(),
  kind: varchar("kind", { length: 190 }).notNull(),
  rules: portableJson("rules"),
  image: portableJson("image"),
  position: int("position").notNull(),
  seo: portableJson("seo").notNull(),
})

export const contactMessages = mysqlTable("contact_messages", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  name: varchar("name", { length: 190 }).notNull(),
  email: varchar("email", { length: 254 }).notNull(),
  orderNumber: varchar("order_number", { length: 190 }),
  message: text("message").notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
})

export const customFieldDefinitions = mysqlTable("custom_field_definitions", {
  storeId: uuid("store_id").notNull(),
  entity: varchar("entity", { length: 190 }).notNull(),
  code: varchar("code", { length: 190 }).notNull(),
  label: varchar("label", { length: 190 }).notNull(),
  type: varchar("type", { length: 190 }).notNull(),
  required: tinyint("required").notNull(),
  visibleOnStorefront: tinyint("visible_on_storefront").notNull(),
})

export const customers = mysqlTable("customers", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  email: varchar("email", { length: 254 }).notNull(),
  passwordHash: varchar("password_hash", { length: 190 }).notNull(),
  fullName: varchar("full_name", { length: 190 }).notNull(),
  phone: varchar("phone", { length: 190 }),
  customerGroup: varchar("customer_group", { length: 190 }).notNull(),
  marketingOptIn: tinyint("marketing_opt_in").notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  deletionRequestedAt: datetime("deletion_requested_at", { mode: "string", fsp: 3 }),
})

export const exchangeRates = mysqlTable("exchange_rates", {
  storeId: uuid("store_id").notNull(),
  base: char("base", { length: 3 }).notNull(),
  rates: portableJson("rates").notNull(),
  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
})

export const faqs = mysqlTable("faqs", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  category: varchar("category", { length: 190 }).notNull(),
  question: varchar("question", { length: 190 }).notNull(),
  answer: text("answer").notNull(),
  position: int("position").notNull(),
})

export const featureFlags = mysqlTable("feature_flags", {
  storeId: uuid("store_id").notNull(),
  key: varchar("key", { length: 190 }).notNull(),
  description: text("description").notNull(),
  enabled: tinyint("enabled").notNull(),
})

export const media = mysqlTable("media", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  path: varchar("path", { length: 512 }).notNull(),
  filename: varchar("filename", { length: 190 }).notNull(),
  mime: varchar("mime", { length: 190 }).notNull(),
  bytes: int("bytes").notNull(),
  width: int("width").notNull(),
  height: int("height").notNull(),
  alt: varchar("alt", { length: 190 }).notNull(),
  createdBy: uuid("created_by"),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
})

export const newsletterSubscribers = mysqlTable("newsletter_subscribers", {
  storeId: uuid("store_id").notNull(),
  email: varchar("email", { length: 254 }).notNull(),
  source: varchar("source", { length: 190 }).notNull(),
  status: varchar("status", { length: 190 }).notNull(),
  consentAt: datetime("consent_at", { mode: "string", fsp: 3 }).notNull(),
})

export const outboxEvents = mysqlTable("outbox_events", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  topic: varchar("topic", { length: 190 }).notNull(),
  payload: portableJson("payload").notNull(),
  status: varchar("status", { length: 190 }).notNull(),
  attempts: int("attempts").notNull(),
  availableAt: datetime("available_at", { mode: "string", fsp: 3 }).notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  deliveredAt: datetime("delivered_at", { mode: "string", fsp: 3 }),
  lastError: text("last_error"),
})

export const pages = mysqlTable("pages", {
  storeId: uuid("store_id").notNull(),
  slug: varchar("slug", { length: 190 }).notNull(),
  title: varchar("title", { length: 190 }).notNull(),
  description: text("description").notNull(),
  blocks: portableJson("blocks").notNull(),
  seo: portableJson("seo").notNull(),
  published: tinyint("published").notNull(),
  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
})

export const priceLists = mysqlTable("price_lists", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  code: varchar("code", { length: 190 }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  customerGroup: varchar("customer_group", { length: 190 }),
  priority: int("priority").notNull(),
  startsAt: datetime("starts_at", { mode: "string", fsp: 3 }),
  endsAt: datetime("ends_at", { mode: "string", fsp: 3 }),
})

export const promotions = mysqlTable("promotions", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  code: varchar("code", { length: 190 }),
  title: varchar("title", { length: 190 }).notNull(),
  conditions: portableJson("conditions").notNull(),
  actions: portableJson("actions").notNull(),
  startsAt: datetime("starts_at", { mode: "string", fsp: 3 }),
  endsAt: datetime("ends_at", { mode: "string", fsp: 3 }),
  usageLimit: int("usage_limit"),
  perCustomerLimit: int("per_customer_limit"),
  timesUsed: int("times_used").notNull(),
  active: tinyint("active").notNull(),
  combinable: tinyint("combinable").notNull(),
})

export const roles = mysqlTable("roles", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  key: varchar("key", { length: 190 }).notNull(),
  name: varchar("name", { length: 190 }).notNull(),
  description: text("description").notNull(),
  isSystem: tinyint("is_system").notNull(),
  refundLimit: safeBigint("refund_limit"),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
})

export const searchQueries = mysqlTable("search_queries", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  query: varchar("query", { length: 190 }).notNull(),
  normalized: varchar("normalized", { length: 190 }).notNull(),
  resultCount: int("result_count"),
  clickedSlug: varchar("clicked_slug", { length: 190 }),
  source: varchar("source", { length: 190 }).notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
})

export const searchSynonyms = mysqlTable("search_synonyms", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  term: varchar("term", { length: 190 }).notNull(),
})

export const shippingZones = mysqlTable("shipping_zones", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  name: varchar("name", { length: 190 }).notNull(),
  position: int("position").notNull(),
})

export const staffInvites = mysqlTable("staff_invites", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  email: varchar("email", { length: 254 }).notNull(),
  roleKey: varchar("role_key", { length: 190 }).notNull(),
  tokenHash: varchar("token_hash", { length: 190 }).notNull(),
  invitedBy: uuid("invited_by"),
  expiresAt: datetime("expires_at", { mode: "string", fsp: 3 }).notNull(),
  acceptedAt: datetime("accepted_at", { mode: "string", fsp: 3 }),
  revokedAt: datetime("revoked_at", { mode: "string", fsp: 3 }),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
})

export const staffMembers = mysqlTable("staff_members", {
  userId: uuid("user_id").notNull(),
  storeId: uuid("store_id").notNull(),
  role: varchar("role", { length: 190 }),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  email: varchar("email", { length: 254 }),
  displayName: varchar("display_name", { length: 190 }).notNull(),
  status: varchar("status", { length: 190 }).notNull(),
  passwordHash: varchar("password_hash", { length: 190 }),
  totpSecret: text("totp_secret"),
  totpEnabledAt: datetime("totp_enabled_at", { mode: "string", fsp: 3 }),
  totpLastStep: safeBigint("totp_last_step"),
  failedLogins: int("failed_logins").notNull(),
  lockedUntil: datetime("locked_until", { mode: "string", fsp: 3 }),
  lastSeenAt: datetime("last_seen_at", { mode: "string", fsp: 3 }),
  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
})

export const storefrontContent = mysqlTable("storefront_content", {
  storeId: uuid("store_id").notNull(),
  content: portableJson("content").notNull(),
  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
})

export const taxRates = mysqlTable("tax_rates", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  country: varchar("country", { length: 190 }).notNull(),
  province: varchar("province", { length: 190 }),
  label: varchar("label", { length: 190 }).notNull(),
  basisPoints: int("basis_points").notNull(),
  inclusive: tinyint("inclusive").notNull(),
})

export const addresses = mysqlTable("addresses", {
  id: uuid("id").notNull(),
  customerId: uuid("customer_id").notNull(),
  fullName: varchar("full_name", { length: 190 }).notNull(),
  phone: varchar("phone", { length: 190 }).notNull(),
  line1: varchar("line1", { length: 190 }).notNull(),
  line2: varchar("line2", { length: 190 }),
  city: varchar("city", { length: 190 }).notNull(),
  province: varchar("province", { length: 190 }).notNull(),
  postalCode: varchar("postal_code", { length: 190 }),
  country: varchar("country", { length: 190 }).notNull(),
  isDefault: tinyint("is_default").notNull(),
})

export const carts = mysqlTable("carts", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  tokenHash: varchar("token_hash", { length: 190 }).notNull(),
  customerId: uuid("customer_id"),
  currency: char("currency", { length: 3 }).notNull(),
  status: varchar("status", { length: 190 }).notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
})

export const orders = mysqlTable("orders", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  number: varchar("number", { length: 190 }).notNull(),
  customerId: uuid("customer_id"),
  email: varchar("email", { length: 254 }).notNull(),
  phone: varchar("phone", { length: 190 }).notNull(),
  status: varchar("status", { length: 190 }).notNull(),
  paymentStatus: varchar("payment_status", { length: 190 }).notNull(),
  fulfillmentStatus: varchar("fulfillment_status", { length: 190 }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  subtotal: safeBigint("subtotal").notNull(),
  discountTotal: safeBigint("discount_total").notNull(),
  shippingTotal: safeBigint("shipping_total").notNull(),
  taxTotal: safeBigint("tax_total").notNull(),
  taxIncluded: tinyint("tax_included").notNull(),
  total: safeBigint("total").notNull(),
  refundedTotal: safeBigint("refunded_total").notNull(),
  shippingAddress: portableJson("shipping_address").notNull(),
  shippingMethod: portableJson("shipping_method").notNull(),
  paymentMethod: varchar("payment_method", { length: 190 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 190 }).notNull(),
  accessTokenHash: varchar("access_token_hash", { length: 190 }).notNull(),
  customFields: portableJson("custom_fields").notNull(),
  note: text("note"),
  trackingNumber: varchar("tracking_number", { length: 190 }),
  history: portableJson("history").notNull(),
  placedAt: datetime("placed_at", { mode: "string", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
})

export const passwordResets = mysqlTable("password_resets", {
  tokenHash: varchar("token_hash", { length: 190 }).notNull(),
  customerId: uuid("customer_id").notNull(),
  expiresAt: datetime("expires_at", { mode: "string", fsp: 3 }).notNull(),
  usedAt: datetime("used_at", { mode: "string", fsp: 3 }),
})

export const products = mysqlTable("products", {
  id: uuid("id").notNull(),
  storeId: uuid("store_id").notNull(),
  slug: varchar("slug", { length: 190 }).notNull(),
  title: varchar("title", { length: 190 }).notNull(),
  brandId: uuid("brand_id").notNull(),
  kind: varchar("kind", { length: 190 }).notNull(),
  gender: varchar("gender", { length: 190 }).notNull(),
  status: varchar("status", { length: 190 }).notNull(),
  description: text("description").notNull(),
  conditionGrade: varchar("condition_grade", { length: 190 }),
  conditionNotes: text("condition_notes"),
  attributes: portableJson("attributes").notNull(),
  customFields: portableJson("custom_fields").notNull(),
  position: int("position").notNull(),
  publishedAt: datetime("published_at", { mode: "string", fsp: 3 }).notNull(),
  seo: portableJson("seo").notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
})

export const rolePermissions = mysqlTable("role_permissions", {
  roleId: uuid("role_id").notNull(),
  permission: varchar("permission", { length: 190 }).notNull(),
})

export const sessions = mysqlTable("sessions", {
  tokenHash: varchar("token_hash", { length: 190 }).notNull(),
  customerId: uuid("customer_id").notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  expiresAt: datetime("expires_at", { mode: "string", fsp: 3 }).notNull(),
})

export const shippingRates = mysqlTable("shipping_rates", {
  id: uuid("id").notNull(),
  zoneId: uuid("zone_id").notNull(),
  code: varchar("code", { length: 190 }).notNull(),
  label: varchar("label", { length: 190 }).notNull(),
  amount: safeBigint("amount").notNull(),
  freeOver: safeBigint("free_over"),
  minDays: int("min_days").notNull(),
  maxDays: int("max_days").notNull(),
  cashOnDelivery: tinyint("cash_on_delivery").notNull(),
})

export const staffRoles = mysqlTable("staff_roles", {
  userId: uuid("user_id").notNull(),
  storeId: uuid("store_id").notNull(),
  roleId: uuid("role_id").notNull(),
})

export const staffSessions = mysqlTable("staff_sessions", {
  id: uuid("id").notNull(),
  userId: uuid("user_id").notNull(),
  storeId: uuid("store_id").notNull(),
  tokenHash: varchar("token_hash", { length: 190 }).notNull(),
  aal: int("aal").notNull(),
  mfaAt: datetime("mfa_at", { mode: "string", fsp: 3 }),
  ip: varchar("ip", { length: 190 }),
  userAgent: text("user_agent"),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  lastSeenAt: datetime("last_seen_at", { mode: "string", fsp: 3 }).notNull(),
  expiresAt: datetime("expires_at", { mode: "string", fsp: 3 }).notNull(),
  revokedAt: datetime("revoked_at", { mode: "string", fsp: 3 }),
})

export const webhookDeliveries = mysqlTable("webhook_deliveries", {
  id: uuid("id").notNull(),
  eventId: uuid("event_id").notNull(),
  endpoint: varchar("endpoint", { length: 512 }).notNull(),
  status: varchar("status", { length: 190 }).notNull(),
  responseStatus: int("response_status"),
  at: datetime("at", { mode: "string", fsp: 3 }).notNull(),
})

export const collectionProducts = mysqlTable("collection_products", {
  collectionId: uuid("collection_id").notNull(),
  productId: uuid("product_id").notNull(),
  position: int("position").notNull(),
})

export const orderLines = mysqlTable("order_lines", {
  id: uuid("id").notNull(),
  orderId: uuid("order_id").notNull(),
  variantId: uuid("variant_id").notNull(),
  productId: uuid("product_id").notNull(),
  slug: varchar("slug", { length: 190 }).notNull(),
  title: varchar("title", { length: 190 }).notNull(),
  brand: varchar("brand", { length: 190 }).notNull(),
  kind: varchar("kind", { length: 190 }).notNull(),
  condition: varchar("condition", { length: 190 }),
  size: portableJson("size").notNull(),
  imageUrl: varchar("image_url", { length: 512 }).notNull(),
  sku: varchar("sku", { length: 190 }).notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: safeBigint("unit_price").notNull(),
  compareAt: safeBigint("compare_at"),
  discount: safeBigint("discount").notNull(),
  tax: safeBigint("tax").notNull(),
  total: safeBigint("total").notNull(),
  refundedQuantity: int("refunded_quantity").notNull(),
  position: int("position").notNull(),
})

export const orderNotes = mysqlTable("order_notes", {
  id: uuid("id").notNull(),
  orderId: uuid("order_id").notNull(),
  author: uuid("author").notNull(),
  authorName: varchar("author_name", { length: 190 }).notNull(),
  body: text("body").notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
})

export const payments = mysqlTable("payments", {
  id: uuid("id").notNull(),
  orderId: uuid("order_id").notNull(),
  provider: varchar("provider", { length: 190 }).notNull(),
  status: varchar("status", { length: 190 }).notNull(),
  amount: safeBigint("amount").notNull(),
  refundedAmount: safeBigint("refunded_amount").notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  providerRef: varchar("provider_ref", { length: 190 }),
  idempotencyKey: varchar("idempotency_key", { length: 190 }).notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
})

export const productImages = mysqlTable("product_images", {
  id: uuid("id").notNull(),
  productId: uuid("product_id").notNull(),
  url: varchar("url", { length: 512 }).notNull(),
  alt: varchar("alt", { length: 190 }).notNull(),
  width: int("width").notNull(),
  height: int("height").notNull(),
  role: varchar("role", { length: 190 }).notNull(),
  position: int("position").notNull(),
})

export const promotionRedemptions = mysqlTable("promotion_redemptions", {
  id: uuid("id").notNull(),
  promotionId: uuid("promotion_id").notNull(),
  orderId: uuid("order_id").notNull(),
  customerId: uuid("customer_id"),
  email: varchar("email", { length: 254 }).notNull(),
  at: datetime("at", { mode: "string", fsp: 3 }).notNull(),
})

export const returns = mysqlTable("returns", {
  id: uuid("id").notNull(),
  orderId: uuid("order_id").notNull(),
  status: varchar("status", { length: 190 }).notNull(),
  lines: portableJson("lines").notNull(),
  reason: text("reason").notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
})

export const variants = mysqlTable("variants", {
  id: uuid("id").notNull(),
  productId: uuid("product_id").notNull(),
  sku: varchar("sku", { length: 190 }).notNull(),
  sizeEu: varchar("size_eu", { length: 190 }).notNull(),
  sizeUk: varchar("size_uk", { length: 190 }).notNull(),
  sizeUs: varchar("size_us", { length: 190 }).notNull(),
  sizeCm: varchar("size_cm", { length: 190 }).notNull(),
  attributes: portableJson("attributes").notNull(),
  weightGrams: int("weight_grams").notNull(),
  position: int("position").notNull(),
})

export const cartLines = mysqlTable("cart_lines", {
  id: uuid("id").notNull(),
  cartId: uuid("cart_id").notNull(),
  variantId: uuid("variant_id").notNull(),
  quantity: int("quantity").notNull(),
  addedAt: datetime("added_at", { mode: "string", fsp: 3 }).notNull(),
})

export const inventoryLevels = mysqlTable("inventory_levels", {
  variantId: uuid("variant_id").notNull(),
  onHand: int("on_hand").notNull(),
  reserved: int("reserved").notNull(),
  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
})

export const inventoryMovements = mysqlTable("inventory_movements", {
  id: uuid("id").notNull(),
  variantId: uuid("variant_id").notNull(),
  delta: int("delta").notNull(),
  reason: text("reason").notNull(),
  actor: varchar("actor", { length: 190 }).notNull(),
  at: datetime("at", { mode: "string", fsp: 3 }).notNull(),
})

export const inventoryReservations = mysqlTable("inventory_reservations", {
  id: uuid("id").notNull(),
  cartId: uuid("cart_id").notNull(),
  variantId: uuid("variant_id").notNull(),
  quantity: int("quantity").notNull(),
  expiresAt: datetime("expires_at", { mode: "string", fsp: 3 }).notNull(),
})

export const prices = mysqlTable("prices", {
  priceListId: uuid("price_list_id").notNull(),
  variantId: uuid("variant_id").notNull(),
  amount: safeBigint("amount").notNull(),
  compareAt: safeBigint("compare_at"),
})

export const refunds = mysqlTable("refunds", {
  id: uuid("id").notNull(),
  orderId: uuid("order_id").notNull(),
  paymentId: uuid("payment_id"),
  amount: safeBigint("amount").notNull(),
  reason: text("reason").notNull(),
  lines: portableJson("lines").notNull(),
  restock: tinyint("restock").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 190 }).notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
})

export const cartPromotionCodes = mysqlTable("cart_promotion_codes", {
  id: uuid("id").notNull(),
  position: int("position").notNull(),
  value: varchar("value", { length: 190 }).notNull(),
})

export const orderPromotionCodes = mysqlTable("order_promotion_codes", {
  id: uuid("id").notNull(),
  position: int("position").notNull(),
  value: varchar("value", { length: 190 }).notNull(),
})

export const productTags = mysqlTable("product_tags", {
  id: uuid("id").notNull(),
  position: int("position").notNull(),
  value: varchar("value", { length: 190 }).notNull(),
})

export const featureFlagCustomerGroups = mysqlTable("feature_flag_customer_groups", {
  storeId: uuid("store_id").notNull(),
  key: varchar("key", { length: 190 }).notNull(),
  position: int("position").notNull(),
  value: varchar("value", { length: 190 }).notNull(),
})

export const shippingZoneCountries = mysqlTable("shipping_zone_countries", {
  id: uuid("id").notNull(),
  position: int("position").notNull(),
  value: varchar("value", { length: 190 }).notNull(),
})

export const shippingZoneCities = mysqlTable("shipping_zone_cities", {
  id: uuid("id").notNull(),
  position: int("position").notNull(),
  value: varchar("value", { length: 190 }).notNull(),
})

export const staffRecoveryCodes = mysqlTable("staff_recovery_codes", {
  userId: uuid("user_id").notNull(),
  storeId: uuid("store_id").notNull(),
  position: int("position").notNull(),
  value: varchar("value", { length: 190 }).notNull(),
})

export const searchSynonymValues = mysqlTable("search_synonym_values", {
  id: uuid("id").notNull(),
  position: int("position").notNull(),
  value: varchar("value", { length: 190 }).notNull(),
})

