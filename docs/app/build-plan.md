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
