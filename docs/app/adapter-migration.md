# Migrated adapters

M6 supplies MySQL/MariaDB catalogue queries, private persistent storage, prepared image formats, SMTP delivery and bounded cron work. These adapters preserve the existing public DTOs and screens. They do not replace the remaining admin, retirement, deployment or complete production acceptance stages.

## Mail and jobs

`EMAIL_PROVIDER=file` is the safe zero-configuration development default. It writes private MIME messages to `EMAIL_OUTBOX_DIR` (default `.email-outbox`) with atomic creation and restrictive directory/file permissions. A stable event identifier deduplicates concurrent writers and restarts. Production mail uses `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM`. STARTTLS is required on port 587; implicit TLS uses port 465. Certificate verification stays enabled. No real mailbox was contacted during verification: SMTP protocol tests use a loopback-only test server.

`SMTP_HOURLY_LIMIT` defaults to 100 per store and UTC hour. Quota deferral does not consume an outbox failure attempt. Each event has independent email and webhook delivery receipts with fenced leases: a failed webhook does not resend an already recorded successful email, and an old worker cannot overwrite a new worker's receipt. SMTP remains at least once across the unavoidable crash between remote acceptance and committing the receipt. A stable Message-ID helps investigation; it cannot promise recipient-side deduplication. Webhook receivers should deduplicate the event's delivery identifier.

The outbox job claims at most ten events and yields between messages after 20 seconds; individual SMTP/socket operations and webhook requests have their own timeouts. This is a cooperative batch budget, not a strict total request deadline. Repeated delivery errors retain bounded backoff and the existing eight-attempt failure limit. `/api/jobs/cleanup` deletes bounded batches of expired ephemeral rate/idempotency/auth records without deleting merchant history. Reservation release and abandoned-cart cleanup also have bounded batches. Run jobs late or twice safely; see the deployment runbook for scheduler configuration. `CRON_SECRET` is the job bearer secret; `JOBS_SECRET` remains a temporary compatibility alias.

## Files and images

Use `STORAGE_DRIVER=local-disk` and an absolute `STORAGE_DIR` outside the deployed application directory. Immutable content-addressed files use atomic writes; path traversal and symlink/junction parents are rejected. A deployment must preserve this directory and back it up with the database. Removing public media metadata immediately removes route access; immutable bytes remain for offline recovery/orphan cleanup.

Uploads still validate magic bytes, size, decoded pixels and re-encode images without metadata. Upload/import preparation produces WebP and AVIF at widths 320, 640, 960, 1280, 1920 and 2400 without enlarging a source. The custom Next image loader selects a prepared width. `/media/[file]` chooses AVIF/WebP from Accept, validates widths, supports ETag/304 and immutable caching. GET never invokes an image encoder; missing prepared variants fall back to the preserved original. `scripts/media-variants.ts` prepares imported images through a loopback database connection. Sharp must run where upload/preparation runs; there is no silent unvalidated-upload fallback.

The optional S3-compatible reference uses HTTPS, SigV4, private buckets, bounded requests and immutable conditional writes. It is registered through `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY` and `S3_SECRET_KEY`. Tests verify the published AWS signing vector, not a real cloud account. Private-file issuance checks current domain ownership/permissions before creating a purpose/store/path-bound URL lasting at most five minutes; the download route returns attachments with no-store headers.

## Catalogue search

MySQL and MariaDB maintain folded documents, FULLTEXT, vocabulary, field-position and compact-SKU projections in the product write transaction. Native queries preserve pure-service pricing eligibility, scoring, synonyms, fuzzy matching, filters, ordering, facets and DTOs. Existing saved products can be indexed with `scripts/reindex-search.ts`; this changes projections without changing product versions. Binary folded terms preserve distinctions such as German sharp s versus ss. Supplementary-plane prefixes use binary comparison to avoid both engines' incorrect indexed LIKE range elimination; ordinary prefixes keep the indexed path.

The optional HTTPS Meilisearch reference filters tenant/status before accepting results and rehydrates identifiers through the scoped catalogue repository. Native search remains the default. Search parity is verified against the fixture implementation, including long terms and supplementary Unicode. The remaining 100,000-product performance stage must measure and tune the native query plan before a scale claim is made.

## Verification checkpoint

M6: 1,739 application checks and 1,378 fixture/real-engine database checks passed with no failures or pending cases. Typecheck, zero-warning lint, twelve forward SQL migrations/bundles and the production build passed. The current private saved store was copied without modifying its source; both engines retained all 44 originals and passed 3,758 field/byte comparisons with zero differences. Prepared derivatives were added separately. Browser mutations use an isolated copied database/storage, with external mail/payment/webhook providers disabled. Reports remain private under `.data/mysql-migration/m6-*`.
