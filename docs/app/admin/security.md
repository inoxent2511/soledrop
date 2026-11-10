# Admin — security

How the back-office resists the threats that matter for a small store's admin, and which test proves each control. Decisions are in [admin-decisions.md](./admin-decisions.md) (A-001…A-020).

## Threats and controls

| Threat | Controls | Proved by |
| --- | --- | --- |
| Stolen or guessed password | scrypt hashes; mandatory TOTP for every account (A-002), no admin access at AAL1; generic sign-in error and a decoy hash for unknown emails; 10 attempts / 5 min per address, 10 / 15 min per email, lockout after 5 failures (A-005) | `tests/integration/admin-auth.test.ts`, `e2e/admin-auth.spec.ts` |
| Replayed or brute-forced codes | a TOTP step is accepted once per account (`totp_last_step`); 5 code attempts / 5 min per session; recovery codes stored hashed and spent once | `admin-auth.test.ts`, `tests/unit/admin-permissions.test.ts` (RFC 6238 vectors) |
| Session theft / fixation | opaque 256-bit tokens, only their SHA-256 stored; `httpOnly`, `SameSite=Lax`, `Secure` in production; a new token at AAL2; idle 30 min / absolute 12 h; role change, suspension, MFA reset and password change end sessions (A-004) | `admin-auth.test.ts`, `e2e/admin-auth.spec.ts` (replayed cookie after sign-out), `e2e/admin-staff.spec.ts` (suspension) |
| A logged-in member doing more than their role | `adminRoute(access)` on every handler (architecture test), `permissionPage()` on every page, service-level permission checks on every operation, explicit actor/store/grant checks with live session/role validation inside SQL transactions (A-006; migration update) | `e2e/admin-permissions.spec.ts` (every preset role × 24 APIs × 17 pages), `tests/unit/architecture.test.ts`, `tests/db/admin.test.ts` |
| Privilege escalation | non-Owners can't grant permissions they lack or make Owners; Owner role immutable; at least one active Owner, serialized by the common store lock (A-008; migration update) | `admin-auth.test.ts`, `tests/db/admin.test.ts` |
| Sensitive actions from an unattended session | step-up: a fresh code within 10 minutes for refunds, customer/subscriber exports, erasure, staff and role changes, product deletion (A-003); refunds capped per role | `admin-auth.test.ts`, `admin-orders.test.ts`, `admin-customers.test.ts` |
| CSRF | `SameSite=Lax` cookie and an exact own-Origin check on every admin mutation (missing Origin refused) | `e2e/admin-auth.spec.ts`, `origin-security.test.ts` |
| XSS | React escaping; nonce CSP with `strict-dynamic` and no `unsafe-inline` on `/admin` (A-012); browser validation uses Zod's `jitless` mode to avoid its dynamic-code probe; block-page links must be on-site; uploads re-encoded and served with `default-src 'none'; sandbox` | `tests/unit/admin-csp.test.ts`, `e2e/admin-auth.spec.ts` (CSP headers and violation events), `admin-content.test.ts` |
| Malicious uploads | magic-byte check, size and pixel limits, sharp re-encode to WebP (drops EXIF/GPS and appended payloads), no SVG (A-014) | `tests/integration/admin-catalog.test.ts` |
| Spreadsheet formula injection | every CSV export neutralises text cells starting with `= + - @` or a tab | `admin-orders.test.ts` |
| Lost updates | optimistic concurrency (`updated_at`, millisecond-compared) on products, roles, pages and order transitions; idempotency keys on payments and refunds | `admin-catalog.test.ts`, `admin-orders.test.ts`, `tests/db/admin.test.ts` |
| PII exposure | contact details masked without `customers:read_pii` in lists, details, exports and redemptions; secrets never shown (A-018) | `admin-orders.test.ts`, `admin-customers.test.ts`, `e2e/admin-orders.spec.ts`, `admin-settings.test.ts` |
| Abuse of write APIs | 120 writes per minute per staff session | `server/admin/route.ts` |
| Undetected changes | append-only audit log (runtime table grants and guarded writers) with actor, roles, IP, user agent, request id, reason and a before/after diff for every admin mutation | `docs/app/admin/audit-events.md`, every integration suite asserts its audit actions |
| Search-engine and cache leaks | `/admin` is `noindex`, `private, no-store`; API responses `no-store` | `e2e/admin-auth.spec.ts` |

## Known limits

- Staff identity remains in-house (A-001). SQL repositories require explicit actors and store/grant guards, with staff authority revalidated from live rows in transactions. Native permission, ownership and rollback tests run on both engines.
- Production uses `DATA_DRIVER=mysql`. `fixtures` is ephemeral QA; the file-backed local source supports one process. Where the host cannot provide restricted runtime table grants, record that database-enforced append-only protection is unavailable and follow the deployment runbook.
- Invite links are shown once to the inviter instead of being emailed until an email provider is configured.
- Order and sales-report CSV exports require their export permission but do not currently require step-up; customer and subscriber exports do.
- Isolated browser runs exercise every admin project with per-test accounts. Shared demo-account mode still skips duplicate TOTP-limited scenarios. Current evidence and hosted/manual limits are in [verification.md](./verification.md).

## Server module boundaries

Separately bundled modules share transaction/request carriers, SQL session initialization and transaction-scoped staff admissions. Values remain isolated per asynchronous request. Native tests cover cross-module rollback, concurrent initialized connections and self-revocation; application tests cover concurrent actors and commit-only invalidation. No mutable process-wide current-user value is used.
