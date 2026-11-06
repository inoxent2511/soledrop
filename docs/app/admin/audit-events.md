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
