# Hostinger deployment verification checklist

No hosting account, remote database, deployment, domain, DNS, real mail or payment is contacted during this migration. The owner confirmed Web App / Node.js is available. Other account-specific answers below remain unverified. GitHub import with a host-side build is now authorized; a compatible Linux CI build remains the fallback. No long-lived worker or second backend is required.

Public references checked for planning: [Node app setup](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/), [Node limits](https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/). These describe available product features, not the owner's account entitlements. The public limits page rules out relying on an always-running worker or an extra service on shared Node hosting; bounded cron requests are therefore the default. No account settings were changed.

| Owner must verify | Why it matters | Where/how to check in hPanel | Implemented fallback / acceptance stage |
| --- | --- | --- | --- |
| Exact plan and Node app entitlement | A generic PHP site slot is not a Node process | Owner confirmed Web App / Node.js is available; exact resource allocation remains unverified | Use the existing Node entitlement; VPS remains optional (M9) |
| Available Node version | Current Next/native modules and source maintenance scripts have version floors | Node app dashboard → runtime/build settings | Node 24.x pinned; official portable Node 24.22.2 build and 1,729 application checks pass locally; verify the account selection (M9) |
| RAM/CPU/process/request limits | Large builds, image encoding and batches can exceed shared limits | Plan/resource usage and Node app limits | Host Git build authorized; compatible Linux CI build fallback, pool default 5, upload-time variants and bounded jobs (M1/M6/M9) |
| Database engine and exact version | CHECK behavior and SQL compatibility depend on it | Databases → management/phpMyAdmin → server/version details | Fail startup/readiness unless MySQL ≥8.0.16 or MariaDB ≥10.6; common subset targets 10.11 (M1) |
| Connection cap per DB user | Shared plans have limited connections | Database user/plan limits; ask support for the exact per-user limit if not shown | DATABASE_POOL_MAX defaults to 5; finite queue/acquire timeout; no per-request pools (M1) |
| Strict SQL mode, InnoDB, utf8mb4 and UTC sessions | Prevent truncation, invalid quantities and inconsistent timestamps | phpMyAdmin server variables and table status; readiness diagnostics | Set/check strict connection settings and schema declarations; fail rather than weaken integrity (M1) |
| Permission to create triggers | Binary logging/SUPER restrictions often differ by plan | DB user privileges/phpMyAdmin grants; support if hidden | No runtime invariant depends on a trigger: transactions, CHECKs, unique constraints and grants (M1/M3/M5) |
| Separate migrator and app users | App must not have DDL/FILE/admin or audit UPDATE/DELETE | Databases → create users/assign privileges; inspect SHOW GRANTS in phpMyAdmin | Prefer two users; an explicitly configured one-user fallback reports weaker DB enforcement and retains actor guards (M5/M9) |
| Remote DB access and IP rules | Determines how migrations are applied | Databases → Remote MySQL / allowed IPs | SSH runner, explicitly allowed developer runner, or phpMyAdmin SQL bundle; no remote access used here (M1/M9) |
| SSH availability and permitted commands | Node hosting may not allow general maintenance commands | Advanced → SSH Access and Node dashboard controls | Apply plain bundles in phpMyAdmin and use browser one-use owner invite bootstrap prepared via trusted runner (M9) |
| Cron availability and minimum interval | Outbox/expiry must progress without a resident worker | Advanced → Cron Jobs; inspect limits | Same authenticated /api/jobs endpoints work from Hostinger curl or an external scheduler; late/duplicate jobs safe (M6/M9) |
| Persistent writable path, quota and backup coverage | Deployment must not remove uploads | File manager/SSH: confirm an absolute persistent directory outside the deployed app tree; verify quota/backups | STORAGE_DIR with startup write probe; optional S3/R2 reference adapter if persistent disk is unavailable (M6/M9) |
| SMTP host/port/TLS/user/hourly limits | Mail delivery must respect mailbox limits | Emails → mailbox → configuration/settings and plan limits | SMTP transport plus throttled outbox; console/file sink for all local runs (M6) |
| SPF/DKIM/DMARC settings | Deliverability cannot be proved by a local socket test | Email deliverability/DNS section; inspect records without changing them during this run | Runbook instructions and owner post-deploy checks only (M9) |
| sharp/native binary support | Runtime image processing can fail on a different OS/ABI | Runtime logs or a trusted disposable upload smoke check after owner deployment | Generate variants at upload; fail upload clearly if encoder unavailable; package correct runtime native assets. Prepared v2 image reads fail closed if the required object is missing (M6/M9) |
| Outbound HTTPS to PSP/webhooks/object storage | External integrations need network access | Plan docs/support and owner-only post-deploy smoke tests | Config-gated adapters, timeouts, outbox retry and local reference payment/console behavior (M6/M9) |
| Process restarts, deployment behavior and log location | In-memory jobs/cache cannot be durable | Node app logs, restart controls and deployment history | MySQL/outbox remain authoritative; graceful pool shutdown; structured errors without secrets (M1/M6/M9) |
| Upload/body/request time limits | Proxy limits may precede application validation | Node limits/plan support; owner test with permitted image sizes | App byte/pixel checks, capped encoding and batch size; clear errors, no DB orphan on failure (M6/M9) |
| Prebuilt artifact/start command support | Shared Node setup may infer a build command | Node app build/start settings and zip deployment options | Artifact includes standalone/static/public and runtime-only package; VPS profile if the shared flow cannot accept a prebuilt start (M9) |
| Backup retention and restore permissions | Recovery must include DB and uploads | Backups → database/files, phpMyAdmin export/import | Document hPanel backups, mysqldump and an isolated restore drill; keep previous artifact, never roll migrations backward (M9/M10) |

## Local environment observed

Docker and system database servers were absent at orientation. Official portable MySQL 8.0.46 and
MariaDB 10.11.15 now run on loopback ports 3307/3308 in ignored task-owned directories. The verified
merchant transfer on migration 0026 restores all 87 tables to fresh databases on both engines with
equal row content; the original 3,758 preservation checks pass per engine. All 44 originals and
2,200 prepared image variants (2,244 objects total) verify by checksum. Node 24.22.2 was downloaded from nodejs.org and matched the official
SHA-256 manifest before use. Linux/actual hPanel checks are separate from this Windows evidence.

Follow [the deployment runbook](../DEPLOYMENT-RUNBOOK.md) for the code/private-data handoff,
exact commands, all environment values, backup/restore, cron and rollback. Importing the GitHub
repository alone does not copy ignored merchant SQL, uploaded images or the preserved encryption key.

## Decisions that preserve the current application

- Existing in-app customer/staff identities, hashed session tokens, sealed MFA secrets and current URLs are migration inputs, not disposable demo data.
- A current saved catalogue export stays private; imported legacy UUIDs are retained. Newly generated keys are UUIDv7.
- Better Auth's current docs were reviewed. Its documented session schema uses a recoverable token matching the cookie, and its default passwordless 2FA coverage does not meet the requested all-realm/session-hash policy without custom lifecycle replacement. The existing first-party auth will therefore be retained and hardened with a maintained TOTP library; this keeps the cookie, invite and MFA flows unchanged. References: [sessions](https://better-auth.com/docs/concepts/session-management), [2FA](https://better-auth.com/docs/plugins/2fa), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle). No claim is made that Better Auth lacks these general features; the mismatch is this migration's storage and assurance contract.
- UI components and tokens are not refactored to resolve inherited library-contract differences. The plumbing migration compares the actual current UI against its frozen baseline. The inherited source-design gate gap remains separately recorded.
