# Build plan

Phase 1 (storefront) is complete; see [build-log.md](./build-log.md). This plan covers **phase 2: the admin panel**. Run the stages in order in one continuous run. After each stage: `pnpm verify` → local commit → append to `build-log.md` → next stage.

### A0 — Orient, docs, plan
Scope: `docs/app/admin/{admin-ia,admin-design,permissions,audit-events,admin-decisions}.md`, this plan.
Done when: the docs exist and the plan is committed.

### A1 — Foundation: identity, RBAC, shell
Scope: migration (staff auth columns, roles, permissions, role_permissions, staff_roles, staff_invites, staff_sessions, has_permission(), last-Owner trigger, RLS), fixtures tables; permission registry + preset roles; staff auth (password, TOTP MFA + recovery codes, sessions with idle/absolute timeout, lockout, step-up), invites, `scripts/create-owner.mjs`; `proxy.ts`; DAL (`requireStaff`, `requirePermission`); audit with actor/role/IP/UA/reason; module registry; admin shell (sidebar, top bar, page header, no-access, login, MFA enrol/verify); shared components (DataTable, FilterBar, StatusPill, ConfirmDialog, StepUpDialog, EmptyState); permission-matrix and architecture tests.
Done when: an Owner created by the script signs in, enrols MFA and reaches `/admin`; a customer session, an AAL1 session and anonymous requests cannot; every admin route and handler declares a permission (test); the permission matrix doc is generated and in sync (test); verify green.

### A2 — Orders
Scope: list with saved views and filters, detail with timeline, transitions via the state machine, mark paid (bank transfer), fulfil with tracking, refunds (ceilings, step-up), returns receive, cancel with reason, internal notes, packing slip print view, export.
Done when: every action goes through `server/orders` and writes an audit entry and event; role tests pass.

### A3 — Products, collections, inventory, media
### A4 — Customers (PII masking, export, anonymise)
### A5 — Promotions, pricing, shipping, tax
### A6 — Payments
### A7 — Content (pages, FAQs), media
### A8 — Marketing, search analytics, reports
### A9 — Settings, webhooks, API keys, jobs, outbox, health, audit viewer, staff & roles, notifications, command palette
### A10 — Dashboard
### A11 — Hardening
### A12 — QA loop
Scope: production-build verification, all configured browser suites, gallery smoke/accessibility coverage, defect fixes and regression checks.
Done when: two consecutive full production-build QA passes have zero findings, per the original brief. Record automated pass results separately from unresolved performance/design findings and unrunnable requirements; those prevent claiming the full target is complete.
### A13 — Documentation (runbook admin bootstrap, data-model RLS matrix, api.md)
Scope: complete the admin runbook, API/RLS documentation, component gallery and implementation notes.
Done when: docs describe the shipped code, QA evidence and operational limits, and changes are committed locally.

### A14 — Saved catalogue and banner controls
Scope: retain the live preview catalogue and uploads in durable local storage; remove runtime sample-product/merchandising fallbacks; expose controls for every displayed banner; isolate QA data and fix regressions.
Done when: imported IDs/prices/stock/uploads/history are compared with the export; product and banner writes survive hard restarts; empty catalogues do not refill; banner edits work across three browsers, mobile widths and permissions; documentation and local commit capture the results. Hosted integration and the older strict A12 gaps remain separate.

Each later stage gets its "Done when:" written when it starts, from the module list in [admin/admin-ia.md](./admin/admin-ia.md).

A14 is complete (2026-11-07): the live catalogue is saved, every displayed photographic banner has an admin control, and migration/restart/browser evidence is recorded in [admin/verification.md](./admin/verification.md). The earlier strict A12 requirements remain separate.

**Status:** A0–A11 and the A12 implementation fixes (`8777e34`) are committed. The A12 automated regression checkpoint passed twice; **strict A12 sign-off remains open** for the requirements listed in [admin/verification.md](./admin/verification.md). A13 documentation is complete. See [build-log.md](./build-log.md) for results and the resume point, and [admin/security.md](./admin/security.md) for the implemented controls. Resume at the remaining A12 gaps rather than rebuilding completed modules.

## MySQL/MariaDB migration — current authorized work

2026-11-08 update: the owner explicitly authorized completing the migration and pushing the verified release to the existing GitHub remote, then asking them to import it into Hostinger. Direct GitHub import (and its Hostinger build flow) is now the delivery target. This supersedes the earlier no-push/build-elsewhere restrictions for that verified release. Hosting-account actions, remote database access, real mail/payments and deployment remain outside this run.

Baseline: `8bdc580`. User decision: Next.js remains the only backend; Hostinger MySQL/MariaDB replaces the legacy database/services. No push, deployment, remote database/account/DNS action, real email/payment or spending. Universal contracts are frozen; exact source inventory and their digests are in `migration-inventory.md`. Preserve the current saved catalogue and every rendered UI behavior.

| Stage | Scope | Done when |
| --- | --- | --- |
| M0 — inventory and baseline | All schema objects, repository methods, auth/storage/jobs/env/dependency/test/doc touchpoints; Hostinger checklist; protected contracts; UI/source baseline | Every legacy object has a replacement/stage; account facts stay unverified; pre-migration checks and baseline recorded; local documentation commit |
| M1 — database foundation | Local MySQL 8 and MariaDB 10.11 profiles/portable fallback, Drizzle/mysql2, UUIDv7 BINARY(16), common schema, pool, strict UTC, migrator/checksums/advisory lock, seed/reset/lint/bundles | Migrations/constraints and bootstrap run on each available real engine; unsafe versions/checksum tamper rejected; unavailable engine marked blocked with evidence |
| M2 — repositories and contracts | All 13 domains; 154 existing method capabilities; typed relational mappers; shared fixture/MySQL/MariaDB contracts; import saved local records | Same DTO/business results on available engines; every source field retained; private catalogue import compared without changing IDs/MFA/history |
| M3 — transactional operations | Replace 52 declared SQL functions/helpers with repository transactions or pure guards; sorted row locks, counters, idempotency, bounded retry | Real multi-connection races pass repeatedly for stock, orders, coupons, expiry, refunds, Owner and optimistic edits; non-idempotent external work never retried |
| M4 — authentication | Preserve existing in-app realms and flows; hardened scrypt, maintained TOTP, hashed tokens/recovery codes, verification/magic/OAuth config gates, bootstrap | Staff MFA/step-up/timeouts/revocation and customer journeys pass; security/CSRF/cookie/enumeration cases verified; no plaintext owner bootstrap storage |
| M5 — authorization/grants | Required actors at repository boundary, query-owned/store/PII scopes, DAL per protected endpoint/page, least-privilege users and append-only audit | Generated permission/mutation and ownership matrices pass; actor/static SQL boundaries enforced; app UPDATE/DELETE audit and DDL denied; weaker host option explicit |
| M6 — adapters | External local-disk/S3 reference, upload variants, SMTP/file sink/throttle, atomic rate limits, FULLTEXT/vocabulary/search reference, bounded cron jobs | DTOs/screens unchanged; image and storage failure tests, search parity, retry/idempotent job behavior and local SMTP tests pass; no real mail/payment |
| M7 — admin dependencies | Roles, permissions, audit, versions/drafts actually present, inventory/media/content operations | Existing modules and mandatory mutation guards pass on new backend; no capability silently dropped or invented from the prompt's assumptions |
| M8 — retirement/readiness | Remove legacy repositories/deps/env/folder/types/tests after intent port; mysql/fixtures switch; engine/version/schema/pool/storage/SMTP readiness; current product docs | No forbidden legacy vendor strings in runtime source/config/env; frozen contracts unchanged; legacy test intent survives in new checks |
| M9 — Hostinger package | Local build/upload artifact, PORT/HOSTNAME, runtime-only deps, two-user grant SQL and phpMyAdmin paths, cron/SMTP/storage/backups/restore/rollback docs, VPS profile | Artifact boots locally from a clean unpack; checklist/runbook is configuration-ready; no hosting or domain action performed |
| M10 — full QA loop | Two clean production-build passes per available real engine; contracts/concurrency/security/ownership, journeys/admin, axe, containment, pixel/geometry parity, perf/load/failure drills | Every runnable check recorded honestly; no thresholds lowered or skipped to hide failures; unavailable/manual/design checks named explicitly; local commits and final report |

Stages are executed continuously in this order, with validation and local commits. M5 actor types are designed with M2 interfaces so there is no unsafe unscoped MySQL interim path. Existing local data is backed up before changing runtime configuration. Current inherited QA findings are carried visibly until resolved or explicitly blocked; passing migration subsets never imply the whole definition of done passed.
