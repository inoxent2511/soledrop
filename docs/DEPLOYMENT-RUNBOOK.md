# Sole Drop deployment runbook

The application runs Next.js as its only backend, with MySQL/MariaDB, persistent media and a
bounded transactional outbox. The owner has confirmed that Web App / Node.js is available in
hPanel. Account setup and the actual hosted deployment remain owner actions; local acceptance
does not verify the account's database, storage, mail or proxy configuration.

Consult the [migration report](MIGRATION-REPORT.md) for the release's validation evidence and
remaining source-design, account and manual checks before opening customer traffic.

## 1. Release and private merchant data

There are two separate inputs:

1. **Code:** the verified GitHub release, including forward SQL, package lock, runtime adapters and
   this runbook. Never upload Windows `node_modules` or a Windows-built native module to Linux.
2. **Private handoff:** the ignored local `.data/hostinger-handoff/` candidate selected by
   `.data/mysql-migration/m9-handoff-location.json`. It contains schema SQL, merchant data SQL,
   checksums, the referenced upload tree, a private environment template and restore evidence.
   It contains customer/staff/security data. Transfer privately, keep it outside web-accessible
   directories and Git, and retain an encrypted offline backup. GitHub import alone cannot copy it.

The handoff retains the current catalogue, prices, stock, order history, staff password hashes,
sessions and enrolled MFA. Preserve its `SESSION_SECRET` exactly. Do not run demo seeding or
create a replacement Owner. The existing Owner signs in at `/admin/login` with the existing
password and enrolled authenticator; the migration does not reset either credential.

Pause merchant writes while taking the final release snapshot and copying uploads. The SQL
backup is a consistent InnoDB snapshot; a deployment transfer must also capture files referenced
by that snapshot. Retake the handoff if the merchant source has changed since validation.

## 2. Hostinger GitHub import

Hostinger documents GitHub-backed Node applications and Node 24. Select a **server-side Node.js
Web App**, repository `inoxent2511/soledrop`, branch `main`, root `./`, and Node **24.x**. This
project pins pnpm **12.16.1**. Install with `pnpm install --frozen-lockfile`, build with `pnpm build`.
Use the Next.js preset and `pnpm start` where a start command is offered. Its output is `.next`;
the self-contained release lives at `.next/standalone`. [Hostinger setup](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/),
[Node version selection](https://www.hostinger.com/support/how-to-select-the-node-js-version-for-your-application/).

For a custom/Other configuration that launches the output directly, select output directory
`.next/standalone` and entry file `server.js` relative to that output. Confirm the resolved entry
in build/start logs; dashboard field behavior is account-specific. The equivalent shell command
from the repository root is `node .next/standalone/server.js`. `pnpm start` is the repository
wrapper and uses that same server in one process. Both respect the host-supplied `PORT`; default
is 3000, with `HOSTNAME=0.0.0.0`. Do not pin a custom public listening port in hPanel.

`pnpm build` packages `public` and `.next/static` into the standalone tree. Startup does not copy
or delete assets. Packaging fails on private runtime paths, embedded real environment secrets or
dependency links outside the artifact. Dependencies in the output are runtime-only traces; build/test tools stay in
the source/build environment. Native Sharp libraries must be installed for the build's Linux
platform. If a host build exceeds its resources, build the same commit on compatible Linux CI
and privately upload the standalone output through the supported Node application flow.

Set `NEXT_PUBLIC_SITE_URL` before building; public metadata is build-time configuration.
Set `SITE_URL` at runtime to that same canonical HTTPS origin. Server CSRF, payment return,
order, OAuth and email links use runtime configuration. Secrets are runtime environment values,
never build arguments. A credential-free build is supported; a credential-free production
startup deliberately fails. Disable automatic production deployment while staging/migrating;
Hostinger's Git integration may otherwise rebuild on each push. Recheck this setting in hPanel.

Do not direct customers to the application until the following database/storage/environment
steps and post-deployment smoke checks have completed. A temporary preview origin must use
its own SITE_URL and build public URL, with real payment/mail integrations disabled.

## 3. Database creation, accounts and import

In hPanel Databases create a new empty database. Record its full prefixed database name,
hostname, port and exact engine/version. Supported floors are MySQL **8.0.16** and MariaDB
**10.6**, targeting MariaDB **10.11**. InnoDB, strict SQL, utf8mb4 and UTC are required.
Startup refuses an unsupported engine, missing store or drifted migration/physical schema.

Prefer two dedicated users: migrator with rights on this schema, runtime app with table-specific
DML. Adapt `db/dist/grants.sql`, generated by `node scripts/db-grants.mjs` with GRANT_DATABASE,
GRANT_APP_USER, GRANT_MIGRATOR_USER and GRANT_ACCOUNT_HOST. Do not publish account passwords
in SQL or Git. Remove any broad global/schema runtime grants: otherwise per-table restrictions
cannot enforce append-only audit/history. Neither runtime nor migrations need trigger privileges.

Some shared plans expose one DDL-capable user or cannot assign per-table grants. In that case
use the supplied account, retain all application actor/transaction guards, and explicitly record
that database-enforced append-only protection is unavailable. Do not claim least privilege on
that plan. Ask support about a second account/table grants; use a VPS when those controls are
mandatory. The checklist records this account fact separately from local two-user evidence.

Choose one migration path:

| Path | Procedure |
| --- | --- |
| SSH on the host | In a source checkout with dependencies, run `pnpm db:migrate` using the migrator DATABASE_URL. Load the private environment with Node `--env-file` or the shell; keep credentials out of command history. |
| Allowed remote runner | Owner explicitly enables Remote MySQL for the trusted runner IP, uses verified TLS where offered, then runs the same ledger-aware command. Remove temporary access afterward. No remote database was used during local QA. |
| phpMyAdmin | Select the new empty database. Import handoff `01-schema.sql` (same release's `db/dist/full-schema.sql`), then `merchant-data.sql`. The import must complete without errors. The SQL contains no CREATE DATABASE, server users, DEFINER or privileged routines. Use the host's upload limits/compression as needed. |

For this store, import preserved merchant data rather than `db:seed`. On an unrelated new store,
`pnpm db:seed` creates minimal operating configuration only; `pnpm admin:create-owner` creates
an expiring one-use setup link via a trusted local/SSH source runner. Treat that link as a secret.
Demo fixture commands refuse production/remote merchant databases and are never deployment steps.

The migrator verifies checksums under an advisory lock. DDL auto-commits: inspect a partially
failed migration before retrying; never edit an applied file. The full schema bundle is for an
empty database. Subsequent ALTER files require the ledger-aware runner or careful one-time
phpMyAdmin application with matching ledger entries. Read `db/README.md` before upgrades.

An upgrade from before migration 0021 also requires `pnpm db:reindex-orders`, with the private
app DATABASE_URL and correct STORE_ID loaded, from a local/loopback SSH source runner. Repeat
for every store in the database. This bounded, restartable step preserves order timestamps and
builds exact Unicode search projections. Startup refuses an incomplete backfill. A complete
merchant backup from this release already includes these rows; do not seed over that import.

Apply all forward migrations through 0026 before starting this release. Migration 0026 adds
an indexed generated availability column; it does not change physical stock or reservations.
Use this release's backup/restore tools, which omit generated columns from data INSERTs.
The database recreates those values from the preserved quantities. No inventory seed or stock
reset is required for this upgrade.

After import use the **app** DATABASE_URL in hPanel. URL-encode password characters such as
`@`, `:`, `/`, `#` and `%`. Do not use migrator credentials in normal runtime when separate users
are available. Keep `DATABASE_POOL_MAX=5` initially; account for every running deployment/process
when comparing that value with the database user's connection cap.

## 4. Persistent storage and mail

Create a private persistent directory outside `public_html` and **outside the changing hbuilds
release tree**, for example `/home/ACCOUNT/soledrop-shared/uploads`. Use the actual writable path
confirmed by the host; the example is not an account fact. Copy the **contents** of the handoff's
`uploads/` there, preserving the two-character subdirectories and hashed filenames. The Node
account needs directory traversal/write rights; prefer directory 700 and file 600, never 777.
Verify ownership and restart/redeployment persistence with an admin test upload before launch.

The media route serves prepared originals/variants; HTTP image reads do not encode images.
Uploads generate the six legacy widths and nineteen exact responsive widths in WebP/AVIF.
Version 2 matches the preserved optimizer's q=75 output, with four encoder threads for stable
AVIF tiling. Existing v1 bytes remain immutable. An unavailable encoder fails the upload
clearly. Prepare existing variants on a compatible trusted runner with `scripts/media-variants.ts`
before serving a release that uses v2, including upgrades with existing uploads. The restartable
backfill retains existing keys; v2 reads fail closed when their prepared object is absent.
Never silently substitute an incompatible native binary. For storage without persistent
disk, configure the S3-compatible reference adapter and copy objects through a trusted runner.

Local QA and the private template use a private MIME file sink. Before accepting real orders or
password resets, configure `EMAIL_PROVIDER=smtp`, the mailbox host/user/password, verified TLS
(587 STARTTLS or 465 implicit TLS), `EMAIL_FROM` and the provider's hourly limit. Startup checks
the configured transport; a successful login test alone does not prove recipient deliverability.
Set SPF, DKIM and DMARC through the mailbox provider's instructions, then manually verify inbox,
spam, reset/invite and order-confirmation delivery. No real mail was sent during local acceptance.

The outbox survives restarts and retries failed channels. Its 100/hour default is a software
budget, not a statement of the mailbox allowance. SMTP acceptance followed by a lost database
receipt can deliver twice; stable Message-IDs help recipients deduplicate that crash boundary.

## 5. Environment reference

Start from the private handoff template for this existing store. `.env.example` documents defaults
for a new development checkout. hPanel environment values supply runtime configuration; do not
put production secrets in a tracked `.env` file. Blank optional values are treated as absent.

| Variables | Purpose / requirement / source |
| --- | --- |
| NODE_ENV | `production` at runtime; set by the start wrapper. |
| DATA_DRIVER | `mysql` (default); fixtures/local are explicit development/migration tools. |
| DATABASE_URL | Required runtime app connection; hPanel DB host/name/account. |
| DATABASE_POOL_MAX, DATABASE_SSL | Default `5`, `false`; enable verified TLS for a supported remote DB. |
| DATABASE_ACQUIRE_TIMEOUT_MS, DATABASE_QUERY_TIMEOUT_MS, DATABASE_TRANSACTION_TIMEOUT_MS | Defaults 10000/10000/30000; each accepts 100–120000 ms. |
| STORE_ID | Existing store UUID from private handoff; do not replace it. |
| SESSION_SECRET, AUTH_SECRET | Preserve SESSION_SECRET from handoff. AUTH_SECRET is an optional alias and must match if both are set; never rotate during migration. |
| SITE_URL, NEXT_PUBLIC_SITE_URL | Runtime/build canonical HTTPS origin, e.g. `https://shop.example.com`; no path/query/credentials for SITE_URL. |
| NEXT_PUBLIC_DEFAULT_CURRENCY | Build public default: PKR, USD, AED or GBP. |
| COOKIE_SECURE | `true` on hosted HTTPS; false is only for isolated plain-HTTP loopback QA. |
| TRUSTED_PROXY_HOPS | Default 1; confirm the host's actual forwarding chain before changing it. |
| PORT, HOSTNAME | Host-supplied listening port; bind `0.0.0.0`. Defaults 3000/0.0.0.0. |
| STORAGE_DRIVER, STORAGE_DIR | `local-disk` and an absolute persistent directory outside the application. |
| S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY | Required together for optional S3 storage; region default `auto`; private provider values. |
| EMAIL_PROVIDER, EMAIL_OUTBOX_DIR | `smtp` for customer delivery; `file` for private testing with an absolute private sink directory. `console` is a local summary adapter. |
| SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS | Mailbox connection; default 587/false requires STARTTLS; 465/true for implicit TLS. |
| SMTP_HOURLY_LIMIT, EMAIL_FROM | Actual mailbox quota and verified sender identity; default budget 100/hour. |
| CRON_SECRET, JOBS_SECRET | 16+ random characters; preserve private handoff value. JOBS_SECRET is the compatibility fallback. Use a distinct secret from sessions. |
| ADMIN_DEMO_STAFF, ADMIN_IP_ALLOWLIST | Keep demo `off`; optional comma-separated IPv4/IPv6/CIDR admin restriction, checked after trusted proxy parsing. |
| AUTH_MAGIC_LINK, AUTH_EMAIL_VERIFICATION | Optional customer capabilities, `off` by default; enable only after mail delivery works. |
| OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET | Optional HTTPS identity provider; configure all together. Callback `/api/auth/oauth/callback`; no automatic email linking. |
| STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET | Optional payment provider secrets; obtain from Stripe; do not enable real transactions during staging. |
| BANK_NAME, BANK_ACCOUNT_TITLE, BANK_IBAN | All required to show production bank transfer; verified merchant payee data. |
| TURNSTILE_SECRET_KEY, NEXT_PUBLIC_TURNSTILE_SITE_KEY | Optional bot verification server secret/build public site key; register the correct domain. |
| API_KEYS | Optional headless clients `name:key:read+write`, comma-separated; distinct high-entropy keys. |
| WEBHOOK_ENDPOINTS | Optional comma-separated authorized outbound HTTPS receivers. |
| FEATURE_FLAGS, RESERVATION_TTL_MINUTES | Optional `flag=on\|off` overrides; reservation default 15 minutes. |
| LOCAL_DATA_DIR | Saved local-driver migration source only; default `.data/store`, not production media storage. |
| NEXT_TELEMETRY_DISABLED | Optional `1` for builds/runtime. |

Tool-only configuration (`DB_TEST_CONNECTIONS`, `DB_TEST_ADMIN_CONNECTIONS`, LOCAL_DB_ROOT_PASSWORD,
DB_RESET_CONFIRM, GRANT_* and QA_* values) belongs only on trusted local/CI runners. Test/root
accounts, demo staff files and QA source data must never enter hosted runtime configuration.

## 6. Scheduled jobs

Use short authenticated HTTP POSTs, not a permanent worker. Schedule outbox every minute,
reservation release every minute, cart purge hourly and cleanup daily (adjust to plan minimums).
All jobs are bounded and tolerate late/duplicate invocation. Repeated outbox calls make progress
through a backlog; inspect failures rather than increasing batch/request duration indefinitely.

Store the cron secret in a private script/config, not a public URL query. Example command inside
that private shell script, with CRON_SECRET loaded from private configuration:

```sh
curl --fail --silent --show-error --max-time 90 -X POST \
  -H "Authorization: Bearer $CRON_SECRET" https://shop.example.com/api/jobs/outbox
```

Use the same form for `/api/jobs/release-reservations`, `/api/jobs/purge-carts` and
`/api/jobs/cleanup`. Hostinger's current Node cron tool loads application environment only when
explicitly configured; schedules use UTC. Confirm exact paths and cron limits in hPanel.
[Hostinger cron guide](https://www.hostinger.com/support/how-to-run-cron-jobs-for-node-js-websites-at-hostinger/).

If cron is unavailable or too infrequent, configure an external scheduler such as GitHub Actions
or cron-job.org with HTTPS POST and the Authorization header. For Actions use private repository
secrets for URL/token, `permissions: {}`, a timeout and concurrency guard. Do not print the token,
enable shell tracing or place it in workflow source. This repository does not enable an automatic
production scheduler or deployment during local migration.

Shared Node hosting has finite request/process resources and does not support resident queue
workers; keep the existing bounded jobs and small pool. [Hostinger Node limits](https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/).

## 7. Backups, restore and rollback

Enable hPanel database **and file** backups, confirm their retention and perform a private restore
drill. Also keep an encrypted off-host copy of SQL, uploads, release commit and the original session
key. A database-only backup cannot restore photos; a code-only backup cannot restore the store.

With a private, permission-600 client options file, a native backup routine is:

```sh
mysqldump --defaults-extra-file=/private/db-client.cnf --single-transaction \
  --quick --hex-blob --no-tablespaces --set-gtid-purged=OFF DATABASE_NAME > /private/store.sql
# MariaDB client: use mariadb-dump; omit the MySQL-only --set-gtid-purged option.
```

Do not include users, privileges, routines or triggers. Pause DDL and coordinate upload capture
while backing up. Check the exit code and restore into a new disposable database before trusting
the backup. Version-native dump SQL can contain engine-specific statements; test the intended
target engine rather than assuming cross-engine compatibility.

The portable application data backup used for this handoff is:

```sh
node scripts/database-backup.mjs backup /private/merchant-data.sql
node scripts/backup-uploads.mjs backup /private/live-uploads /private/new-upload-backup /private/merchant-data.sql.manifest.json
```

Provide DATABASE_URL privately. The backup streams a consistent snapshot, uses hex literals for
binary/text/date/JSON safety, omits generated columns and retains migration application timestamps.
It creates files exclusively and refuses to overwrite a backup. The upload tool copies only media
metadata-referenced originals and all fifty prepared variants (twelve v1 and thirty-eight v2),
then verifies every checksum.
For additional private attachments outside that media library, back up their complete separate
storage namespace too. The current store has no such attachment objects.

For a trusted-runner restore, create an **empty** database with this release's forward schema,
set its migrator DATABASE_URL privately, then run:

```sh
node scripts/database-backup.mjs restore /private/merchant-data.sql
```

It verifies the adjacent manifest's SHA-256, exact schema ledger and empty merchant tables, and
rolls back failed data inserts. It deliberately refuses an existing populated store. For phpMyAdmin,
verify the checksum first, import schema then data, and stop on any import error. Compare table
counts and media hashes, start with the matching app/key, then exercise readiness, sign-in, stock,
checkout and order lookup before routing traffic. Local handoff evidence covers both engines.

Rollback application code to the previous compatible artifact/commit. Keep migrations forward-only;
do not run destructive down migrations. If data itself must be restored, stop writes, retain a new
backup of the incident state, restore the tested SQL/uploads/key set into a new database/directory,
then switch configuration together. Never mix a restored DB with unrelated files or a new key.

## 8. Monitoring and launch checks

- Check `/api/health` (process) and `/api/ready` (database/schema/store/storage/mail), both over HTTPS.
  A startup failure exits the process even if the HTTP listener briefly printed its ready banner.
- Inspect hPanel build/runtime logs and resource graphs after each restart. Readiness diagnostics
  expose engine/version/check statuses, never credentials or private paths. Investigate 503s and
  pool timeouts before raising limits. Set alerts outside the application for sustained failures.
- Browse home, every active collection, product, search, cart and content page on mobile/desktop.
  Confirm images load and the removed banner eyebrow text is absent.
- Sign in with the preserved Owner and authenticator. Check orders/products/media, Banners & images,
  homepage and collection editors. Save a disposable image change, verify public output, restore it
  and confirm it survives restart. Verify a restricted staff account cannot access forbidden actions.
- Complete controlled COD/transfer journeys, retry an identical checkout key, inspect stock/order
  totals and guest/customer ownership. Use payment sandbox configuration for any card checks.
- Trigger jobs twice; verify queue/expiry progress and no duplicate business effect. Test recipient
  mail delivery and the provider webhook in its sandbox before enabling real services.
- Confirm cookies are Secure/HttpOnly, Origin matches the canonical domain, forwarded client IP is
  correct, private directories are not HTTP-accessible, and backups restore successfully.

Domain/DNS/SSL and traffic switching are owner actions after these checks. Establish one canonical
HTTPS hostname and redirect aliases at the host. Do not expose preview environments with real keys
or create separate unconstrained pools for every hostname.

## 9. Optional VPS profile

Use `Dockerfile` on compatible Linux for the standalone app, Node 24 and an unprivileged runtime.
Mount persistent uploads outside `/app`; supply secrets at runtime. Run MariaDB 10.11 on a private
network with its own durable volume, database backups and separate app/migrator users. The local
`db/compose.yml` is a test-engine profile. The optional `deploy/compose.yml` provides app/MariaDB
services with private env inputs, loopback app binding and persistent volumes; initialize separate
users/schema through a trusted administrator before starting the app. Prepare bind-mounted
directories for the image's UID 1001. This profile is documented but Docker was unavailable locally.
Terminate TLS through a reverse proxy, forward the actual client chain and configure graceful
termination before replacing the container. A systemd/PM2 supervisor is an alternative to Docker;
run one supervised app process per configured pool budget and use an external cron timer.

Move to a VPS when per-table grants, durable storage, connection/process resources, request limits
or controlled maintenance cannot meet the store's requirements on the shared plan. Docker/VPS
deployment and real hosted acceptance are documented options, not locally verified account actions.
