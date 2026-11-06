# Data model

Source of truth: `supabase/migrations/` (schema → RLS → functions, forward only), mirrored by the
TypeScript domain types in `server/<domain>/types.ts`. Tests run the migrations in PGlite
(`tests/db`). 52 tables (42 commerce, 2 search, 8 admin), all in `public`, all with RLS enabled and denied by default.

## Conventions

- **Money:** `bigint` minor units (paisa); `Rs. 14,999` = `1499900`. Computed only on the server.
- **Ids:** `uuid` (`gen_random_uuid()`), except `stores.id` (text: one store per deployment, `STORE_ID`).
- **Time:** `timestamptz`.
- **Tenancy:** every top-level row has `store_id` (multi-store ready).
- **Flexible data:** `jsonb` for attributes, custom fields, rules, blocks, SEO.
- **Errors:** functions raise `code: shopper message`, which the app maps to HTTP (`api.md`).

## Domains

| Domain | Tables | Notes |
| --- | --- | --- |
| Store & staff | `stores`, `staff_members` | Legacy `staff_role` enum: owner, manager, fulfilment, support; phase 2 staff use their own password/MFA sessions and RBAC roles (A-001, A-007). Supabase-Auth identities can use `auth.uid()` policies. `stores.next_order_number` feeds `SD10001…`. |
| Catalogue | `brands`, `collections`, `collection_products`, `products`, `product_images`, `variants`, `attribute_definitions`, `custom_field_definitions` | `products.kind` new\|preloved; `check ((kind='preloved') = (condition_grade is not null))`. Grades: like-new, premium, excellent, very-good, minor-issue (D-069). Image `role` card\|gallery (D-016). Collections are manual or rule-based (`rules` jsonb, `server/rules/engine.ts`). |
| Inventory | `inventory_levels`, `inventory_reservations`, `inventory_movements` | `on_hand ≥ 0`, `reserved ≥ 0`, `reserved ≤ on_hand` (checks), so stock can never go negative. Every change writes a movement (ledger). |
| Pricing | `price_lists`, `prices`, `exchange_rates`, `tax_rates` | Price lists by currency, customer group, priority and date window (B2B wholesale list behind `b2b-pricing`). GST 18 % inclusive (basis points). |
| Shipping | `shipping_zones`, `shipping_rates` | Zones by country/city; rates with `free_over` and a COD allowance. |
| Promotions | `promotions`, `promotion_redemptions` | Conditions/actions as jsonb. `times_used ≤ usage_limit` (check); per-customer limit enforced in `redeem_promotion`. |
| Customers | `customers`, `addresses`, `sessions`, `password_resets` | Shopper accounts are separate from staff auth: scrypt hashes, hashed session tokens. One default address (partial unique index). |
| Cart | `carts`, `cart_lines` | Quantity 1–10, one line per variant. Merged into the customer's cart on sign-in (`merge_carts`). |
| Orders | `orders`, `order_lines`, `payments`, `refunds`, `returns` | Unique `(store_id, number)` and `(store_id, idempotency_key)`. Lines snapshot title/price. Refunds stay within the paid amount and line quantity (checks). One open return per order. |
| Content | `pages`, `faqs`, `newsletter_subscribers`, `contact_messages` | Pages are block lists rendered by the block registry. |
| Platform | `feature_flags`, `outbox_events`, `webhook_deliveries`, `audit_log`, `rate_limits`, `idempotency_keys` | `audit_log` is append-only (trigger). |

## Order state machine

```
pending_payment → confirmed → processing → shipped → delivered
       ↓              ↓            ↓            ↓          ↓
   cancelled      cancelled    cancelled     returned   returned        refunds: any paid state
```

The SQL `can_transition()` and `server/orders/state-machine.ts` are the same table (checked by
`tests/unit/orders.test.ts`). Cancelling restocks; delivered orders can request a return inside the
window; `restock_return` puts pairs back.

## Database functions (RPC)

All are `set search_path = ''`, executable by `service_role` only, and each has a contention test in
`tests/db/rpc.test.ts`.

| Function | Guarantees |
| --- | --- |
| `place_order` | One transaction: advisory lock on (store, idempotency key), replay if the key exists, lock inventory rows in `variant_id` order, re-check stock, redeem promotions (`redeem_promotion`), `next_order_number`, insert order + lines + movements + outbox event. |
| `reserve_stock` / `release_expired_reservations` | Checkout holds expire after `RESERVATION_TTL_MINUTES`. |
| `merge_carts` | Guest bag into account bag, quantities capped by the line limit. |
| `transition_order` | Validates the transition, restocks on cancel, writes history and an event. |
| `record_payment` / `create_refund` / `restock_return` | Idempotent by key; amounts bounded by checks. |
| `import_products` | Upsert by slug, used by both the seed and the import API. |
| `claim_outbox_events` / `fail_outbox_event` | `SKIP LOCKED` claims; exponential back-off. |
| `rate_limit_hit` | Fixed-window counter. |
| `anonymise_customer_orders`, `scrub_customer` | Right to erasure (amounts kept for tax). |

### Admin functions (phase 2)

| Function | Guarantees |
| --- | --- |
| `has_permission(store, permission)` | SECURITY DEFINER: does the signed-in user hold the permission through an active membership's roles. Used by the admin RLS policies. |
| `sync_admin_registry`, `save_role`, `delete_role`, `set_staff_roles`, `active_owner_count` | The permission registry and roles; Owner role immutable, system roles undeletable, stale role saves refused; a deferred trigger keeps at least one active Owner. |
| `save_product`, `save_collection` | One product (images, sizes, stock rows, collection links) or collection per transaction; stale saves, taken slugs/SKUs and removing ordered sizes refused. |
| `save_shipping_zone`, `replace_tax_rates` | A zone with all its rates; the whole tax table. |
| `save_page`, `reorder_faqs` | Content pages (rename + stale-save check), FAQ order. |
| `search_report` | Search analytics for the admin. |

Admin tables: `permissions`, `roles`, `role_permissions`, `staff_roles`, `staff_invites`, `staff_sessions`, `order_notes`, `media`; `staff_members` gained the identity columns and `audit_log` the context columns (store, roles, IP, user agent, request id, reason). Migrations `20261107…`–`20261112…`.

Cart line/quantity edits release the previous checkout holds after saving. The Supabase release path
uses `reserve_stock` with an empty item list so hold removal and reserved-count restoration happen
in one transaction; deleting reservation rows directly would leave stock incorrectly reserved.

## Row-level security

- **anon/authenticated:** read published catalogue, prices, shipping, tax, pages and FAQs only.
  Nothing private, and no RPCs.
- **Staff** (`has_staff_role`, SECURITY DEFINER): owner/manager manage the catalogue and
  configuration; fulfilment/support read orders, inventory and customers per role. Orders and stock
  change only through the functions above.
- **RBAC staff** (phase 2, `has_permission`): `rbac_read` policies let a member read what their
  permissions cover (orders and notes with `orders:read`, drafts with `products:read` / `content:read`,
  stock with `inventory:read`, media, promotions, search log, newsletter, the audit log with
  `audit:read`, roles and invites with `staff:read` / `staff:manage`). Staff sessions have no policy at
  all; the server alone reads them. Every write still goes through the server and its functions.
- **service_role** (the server) bypasses RLS. The key never leaves the server.

| Table | anon | authenticated customer | RBAC staff | server |
| --- | --- | --- | --- | --- |
| catalogue, prices, shipping, tax, published pages, FAQs | read (published) | read (published) | read all with the module's `:read` | all |
| orders, lines, payments, refunds, returns, order_notes | — | — | `orders:read` (payments: `payments:read`) | all |
| customers, addresses, newsletter | — | — | phase 1 roles / `marketing:read` | all |
| roles, role_permissions, staff_roles, staff_invites | — | — | `staff:read` / `staff:manage` | all |
| staff_sessions, idempotency, rate limits | — | — | — | all |
| audit_log | — | — | `audit:read` | insert only (append-only trigger) |

Verified by `tests/db/rls.test.ts`.
