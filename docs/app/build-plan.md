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
### A13 — Documentation (runbook admin bootstrap, data-model RLS matrix, api.md)

Each later stage gets its "Done when:" written when it starts, from the module list in [admin/admin-ia.md](./admin/admin-ia.md).
