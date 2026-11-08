# Admin migration checkpoint

Staff catalogue, content, customers, promotions, shipping, settings, synonyms, roles and non-provider order mutations now commit their mandatory audits with their changes. Explicit write-method lists keep reads outside those enclosing transactions. Invalidation is queued until the outer commit; rollback discards it. Product CSV imports also include their audit in the import transaction, and audit failures propagate. Background job invocation is audited before external work starts, with a completion entry afterward; external deliveries cannot be rolled back.

Media reference inspection has its own media:read repository query. Content Editors can inspect draft/archived product and banner references without acquiring product access. Public image reads do not open an enclosing service transaction. Upload decoding and immutable byte/variant preparation happen before the metadata/audit unit of work; rollback leaves inaccessible orphan bytes for offline cleanup. The final metadata write revalidates current staff authority.

## Refund recovery

Forward migration 0013 adds durable refund intents. The first transaction validates permissions, refund ceilings, paid amounts and line quantities, reserves the money/units, freezes the original payment/provider and records the request audit. The provider call runs outside transactions and retry callbacks. Its confirmation is stored separately; ledger, physical restock, event and the staff/API completion audit then commit together. Concurrent/repeated requests reuse the same intent/provider key. Different payloads cannot reuse a key, and another request cannot spend a pending reservation. A lost provider reply or later audit failure retains the reservation for recovery. Pending intents never expire automatically.

Stripe API v1 can remove idempotency keys after 24 hours, so blindly repeating an older POST is unsafe. The adapter attaches a durable metadata key and supports bounded, paginated, read-only refund lookup. Requests older than 23 hours only recover from a verified successful provider result; they cannot create another external refund. Pending, failed, cancelled, mismatched and unverified results remain reserved for investigation. See [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests), [refund lookup](https://docs.stripe.com/api/refunds/list) and [refund statuses](https://docs.stripe.com/api/refunds/object). No real provider was contacted in verification.

If a browser loses its original request key, an operator can inspect and reconcile from a local/SSH loopback connection. Load the normal private server environment first:

```sh
node --conditions=react-server --import ./scripts/register.mjs scripts/refunds.ts pending
node --conditions=react-server --import ./scripts/register.mjs scripts/refunds.ts reconcile <intent-id> "Provider outcome verified"
```

The command refuses a remote database URL and scopes all operations to STORE_ID. Reconciliation makes read-only provider requests and completes a known successful refund; it never submits a provider refund POST. Uncertain or terminal unsuccessful provider results require investigation; the command does not silently release reserved money. Imported completed refunds remain readable without invented historical intents. Each repeated staff action retains the original audit behavior while the money ledger/event/restock remain idempotent.

## Canonical origin

Set `SITE_URL` to the deployed canonical origin at runtime and `NEXT_PUBLIC_SITE_URL` to the same URL at build time. The server uses SITE_URL for CSRF, authentication redirects, OIDC callback verification and email rendering. This permits an independently configured standalone runtime without weakening exact-Origin checks. Browser-public metadata still uses the public build configuration. An isolated QA server must have its own SITE_URL, separate database, uploads and provider-free configuration.

## Evidence

Shared fixture/MySQL/MariaDB drills cover uncertain provider acceptance, payload mismatch, reserved capacity, failed mandatory audit, recovery after confirmation, concurrent completion, one physical restock, tenant/anonymous denial, media rollback and banner rollback/invalidation. Live stored-role tests now include media usage. Private test-specific staff identities let the original browser suites use real password and TOTP forms on an isolated SQL database; merchant credentials are untouched and demo staff remain disabled.

The existing twelve banner journeys passed across Chromium, Firefox and WebKit on the production MariaDB artifact, including actual image upload, homepage/collection publishing, reference deletion guards, stale writes, read-only roles, 320/390/1440 containment and axe checks. This is M7 evidence, not the complete two-pass, two-engine M10 acceptance result.
