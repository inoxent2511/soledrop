# Data model

The authoritative schema is the forward-only SQL in `db/migrations/`. Drizzle mappings live in
`server/db/schema.ts`; domain DTOs live in `server/<domain>/types.ts`. The production driver is
`mysql`, supporting MySQL 8.0.16+ and MariaDB 10.6+ (10.11 acceptance target). Real-engine tests
run through `pnpm db:test`. Fixtures and the saved local driver remain explicit development tools.

## Conventions

- Money uses integer minor units in BIGINT columns, with safe-JavaScript-integer checks at the boundary.
  `1499900` means Rs. 14,999. Pricing and totals are computed on the server.
- New identifiers are UUIDv7 stored as BINARY(16). Imported UUIDv4 identifiers retain their bytes.
- Dates use UTC DATETIME(3); connections enforce UTC, strict SQL mode and REPEATABLE READ.
- Top-level merchant records carry `store_id`. Actor-aware repositories scope reads and writes.
- Filterable lists use indexed child tables with explicit ordering. JSON holds display structures,
  block content, rules and snapshots; it does not replace relational ownership or stock constraints.
- Foreign keys, CHECK constraints and unique indexes enforce portable structural invariants.
  Transactions enforce cross-row invariants. No privileged routines or triggers are required.

## Domains

| Domain | Principal records | Guarantees |
| --- | --- | --- |
| Store and staff | `stores`, `staff_members`, `permissions`, `roles`, `role_permissions`, `staff_roles`, `staff_invites`, `staff_sessions`, `staff_recovery_codes` | Password hashes, opaque hashed session/invite tokens, sealed MFA secrets, live membership/permission checks, immutable system roles and at least one active Owner. |
| Catalogue | `brands`, `collections`, `collection_products`, `products`, `product_images`, `variants`, attribute/custom-field definitions and projections | Optimistic versions, unique slugs/SKUs, ordered images and memberships, ordered sizes protected from deletion. Manual and rule-based collections share the existing rule engine. |
| Inventory | `inventory_levels`, `inventory_reservations`, `inventory_movements` | Nonnegative stock, reserved stock bounded by on-hand stock, indexed generated availability, movement ledger, expiring checkout holds. |
| Pricing and delivery | `price_lists`, `prices`, `exchange_rates`, `tax_rates`, `shipping_zones`, `shipping_rates` and zone child tables | Currency/group/date-window eligibility, deterministic price selection, inclusive tax and existing shipping/COD rules. |
| Promotions | `promotions`, `promotion_redemptions` | Atomic global/customer usage limits and preserved rule semantics. |
| Customers | `customers`, `addresses`, `sessions`, `password_resets`, `customer_security`, `auth_tokens`, `oauth_accounts` | Separate customer/staff realms, credential compare-and-set, one-use proofs, transactional credential/session changes. Optional magic links, verification and OIDC remain disabled unless configured. |
| Cart | `carts`, `cart_lines`, `cart_promotion_codes` | One line per variant, quantities 1–10, ownership checks and stock-aware account merge. Editing lines releases prior checkout holds atomically. |
| Orders | `orders`, `order_lines`, `order_contacts`, `order_promotion_codes`, `order_number_sequences`, `payments`, `refunds`, `refund_intents`, `returns`, `order_notes` | Unique merchant order numbers/idempotency keys, immutable purchased snapshots, bounded payment/refund quantities, authorized notes and durable provider recovery. |
| Content and media | `pages`, `faqs`, `storefront_content`, `media`, `newsletter_subscribers`, `contact_messages` | Optimistic publication, admin-managed homepage/collection imagery, reference-aware deletion. Media metadata is relational; original bytes and prepared variants live in private persistent storage. |
| Search | `search_documents`, field/term/SKU projections, `search_queries`, `search_synonyms`, `search_synonym_values` | Transactional catalogue projections, preserved shared scoring/facets/pricing, private analytics with bounded report/history access. |
| Platform | `feature_flags`, `outbox_events`, `outbox_channels`, `webhook_deliveries`, `audit_log`, `rate_limits`, `idempotency_keys`, `data_imports`, `store_metadata` | Atomic business events, fenced per-channel delivery receipts, scoped rate limits and replay, checksummed one-time imports. |

## Transactions and recovery

Repositories take an explicit verified actor. Request context never substitutes an unverified cookie,
customer identifier or API key for proof. Staff permissions are rechecked at the raw repository boundary;
private customer/order/cart access requires ownership or a narrowly scoped capability. System actors
have named operational purposes. Permission projections preserve masking and each preset role's scope.

Stock, checkout, order-number allocation, promotion redemption, last-Owner checks and authentication
changes acquire consistent store-first locks. Current locking reads avoid stale REPEATABLE READ
snapshots. Deadlock/lock-timeout retries are bounded and restricted to replay-safe units. Mandatory
audit belongs to the same transaction as staff mutations; cache invalidation runs after commit.

Separately bundled server modules share the pool's transaction carrier, actor/effect carriers,
session-initialization map and transaction-scoped admission cache. Values remain isolated per
asynchronous request; sharing those carriers does not share a shopper's or staff member's identity.

`server/orders/state-machine.ts` defines the nine canonical pre-migration order transitions, checked
against the independent transition fixture. Cancellation, return receipt and refund restock share
cumulative physical receipt accounting, so a pair cannot be restocked twice.

A provider refund first reserves the money/units in `refund_intents`. The external call happens outside
the transaction with a stable scoped provider key. Provider confirmation persists before final
ledger/event/restock/audit completion. Uncertain old intents use read-only lookup and remain reserved
until reconciled; see [admin migration](admin-migration.md).

Outbox work has bounded batches, expiring fenced leases and separate channel receipts. A successful
channel is not resent when another channel fails. SMTP acceptance before receipt commit remains an
at-least-once boundary; stable Message-IDs assist downstream deduplication. Queued bearer links are
sealed with the existing session key and opened only by the email renderer.

## Accounts, migrations and tests

Large-catalogue reads use transactional unique-size and headline-price projections. Search
aggregates indexed matching terms and a field-aware vocabulary, preserving the pure scorer's
weights, synonyms and Unicode behavior. Facet results use a bounded, store/query/list-scoped
cache keyed by a database identity and committed catalogue revision. Product, collection and
price mutations advance that revision inside their transaction; rollbacks cannot publish cache
entries, and live stock and page rows are always read separately.

Migration 0026 adds `inventory_levels.available`, generated from `on_hand - reserved`, and its
variant index. Staff stock pages select narrow candidates in bounded batches and retain exact
JavaScript title ordering; they do not truncate the catalogue at 10,000 products. Broad stock
queries keep the availability-index-led join order, while selective scopes use the optimizer.
Legacy missing stock rows still read as zero. Backups omit generated columns from INSERTs.

Sitemap queries project at most 5,000 rows without hydrating product graphs. Large entities
have separate sitemap files advertised in robots.txt. Draft and noindex content stays excluded.

Staff order search uses `order_search_documents` for filters/sorting and shared normalized
values with binary one-, two- and three-character grams. Gram matches are always checked by
exact binary substring before joining order links. Order creation, payment/state/refund changes,
import and anonymisation maintain these records in the parent transaction. Removing a link also
erases unused personal-data values and their grams. Release upgrades must finish the restartable
100-order JS reindex; readiness checks the completed index version without changing order versions.

The runtime account has table-specific DML grants. `audit_log`, `inventory_movements`, `order_notes`,
`webhook_deliveries` and `data_imports` allow SELECT/INSERT only; `schema_migrations` allows SELECT only.
The separate migrator has schema-scoped DDL rights. Shared hosting that exposes only one DDL-capable
account loses database-enforced append-only protection; document that limitation explicitly.

Staff directories load role assignments and permitted recovery-code rows in bulk. They do not
start one database operation per staff member; role order and secret masking remain unchanged.

Startup and `/api/ready` validate the live engine, every migration checksum, physical tables/columns,
store, storage and configured mail transport. Pool admission, queries and transactions have deadlines;
shutdown rejects new admissions and drains active work. See [database tools](../../db/README.md).

The [legacy test ledger](legacy-test-port.md) maps all 60 retired SQL test intents to native contracts.
The shared fixture/MySQL/MariaDB matrix, real contention tests and failure drills cover authorization,
constraints, atomicity, replay, rollback and recovery. They supplement production browser acceptance.
