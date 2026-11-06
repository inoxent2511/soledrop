# Admin — audit events

Every admin mutation writes one `audit_log` row through a domain service (`recordAudit` in `server/admin/service.ts`; storefront and RPC entries keep using `server/platform/guards.ts#audit`). The table is append-only: a trigger rejects updates and deletes, even from the service role.

## Row shape

| Column | Meaning |
| --- | --- |
| `actor` | staff `user_id` (or `system` for jobs) |
| `actor_role` | the actor's role keys at the time, comma-separated |
| `action` | `<entity>.<verb>` from the catalogue below |
| `entity`, `entity_id` | what changed |
| `before`, `after` | JSON snapshots of the changed fields only (secrets never included) |
| `store_id` | the store |
| `ip`, `user_agent`, `request_id` | where the request came from (`x-request-id`, or a generated id) |
| `reason` | free text the staff member gave (required for destructive actions, see `ConfirmDialog`) |
| `at` | server time |

Who can read it: `audit:read` (Owner, Admin) through the admin, and through RLS (`audit_read` policy, `has_permission(store_id, 'audit:read')`).

## Catalogue

Each module stage adds its events here.

### Staff identity and access (A1)

| Action | Entity | Before → after | Reason |
| --- | --- | --- | --- |
| `staff.signed_in` | staff | — | — |
| `staff.locked_out` | staff | — (5th consecutive failed password) | — |
| `staff.mfa_enrolled` | staff | — | — |
| `staff.stepped_up` | staff | — | — |
| `staff.password_changed` | staff | — | — |
| `staff.recovery_codes_regenerated` | staff | — | — |
| `staff.session_revoked` | staff_session | — | — |
| `staff.signed_out_everywhere` | staff | — | — |
| `staff.invited` | staff_invite | `{ email, role }` | — |
| `staff.invite_revoked` | staff_invite | — | — |
| `staff.invite_accepted` | staff | `{ email, role }` | — |
| `staff.roles_changed` | staff | role keys → role keys | optional |
| `staff.suspended` / `staff.reactivated` | staff | `{ status }` → `{ status }` | optional |
| `staff.mfa_reset` | staff | — | optional |
| `role.created` | role | `{ name, refundLimit, permissions }` | — |
| `role.updated` | role | `{ name, refundLimit, permissions }` → same | — |
| `role.deleted` | role | `{ name, permissions }` | — |

### Orders (A2)

Entity `order`, `entity_id` = order number. The order service's own history (`orders.history`) and the database's `order.transition` entries are kept too; these are the staff-side entries.

| Action | Before → after | Reason |
| --- | --- | --- |
| `order.processing` / `order.shipped` / `order.delivered` / `order.returned` / `order.confirmed` | `{ status }` → `{ status, trackingNumber }` | — |
| `order.cancelled` | `{ status }` → `{ status }` | required |
| `order.payment_recorded` | — → `{ provider, amount, reference }` | — |
| `order.refunded` | — → `{ amount, lines, restock }` | required (the refund reason) |
| `return.approved` / `return.rejected` / `return.received` | — → `{ returnId, status }` | optional |
| `order.note_added` | — → `{ noteId }` | — |
| `order.exported` | — → `{ rows, filters }` | — |

### Catalogue, stock and media (A3)

| Action | Entity | Before → after | Reason |
| --- | --- | --- | --- |
| `product.created` / `product.updated` | product | changed fields only (`title`, `slug`, `brand`, `status`, sizes, photo count…) and `prices` when they changed | — |
| `product.published` / `product.unpublished` / `product.archived` | product | `{ status }` → `{ status }` | — |
| `product.deleted` | product | `{ title, slug, sizes }` | required |
| `product.imported` / `product.exported` | product (`*`) | counts | — |
| `brand.created` | brand | `{ name, slug }` | — |
| `collection.created` / `collection.updated` | collection | `{ title, slug, kind, rules }`, product count | — |
| `collection.deleted` | collection | `{ title, slug }` | optional |
| `inventory.adjusted` | variant | `{ onHand }` → `{ onHand }` (the ledger in `inventory_movements` keeps the delta) | required |
| `media.uploaded` / `media.alt_changed` / `media.deleted` | media | file name, size, alt | — |

### Customers (A4)

| Action | Before → after | Reason |
| --- | --- | --- |
| `customer.updated` | changed fields (`fullName`, `phone`, `group`, `marketingOptIn`) | optional |
| `customer.signed_out` | — | — |
| `customer.exported` | — → `{ orders, addresses }` | required |
| `customer.erased` | `{ createdAt }` → `{ ordersAnonymised }` | required |
