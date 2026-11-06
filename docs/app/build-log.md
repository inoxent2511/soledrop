# Build log

## Phase 0 — Design gathering: blocked
Source: plugin (not reachable)     Figma file: Soledrop (key unknown) · exported — · rev 0
Captured: 0 tokens · 0 text styles · 0 components · 0 screens · 0 light / 0 dark screenshots · 0 taps · 0 icons · 0 photos · 0 illustrations
Gate: ✗ blocked: no `design/` export. The agent session (2026-11-03) exposed no Figma executor tools (`figma_*`), and the file guard refuses access to `figma-ai-executor/`.
Warnings: —
Gaps: the whole design.
Intake: components.md ✗ · screens.md ✗ · build-plan.md ✗ · theme generated ✗ · theme check ✗ (all blocked: no design export)
Decisions made:
- Did not start application code. The session also had no shell (no pnpm, next build, tests, Playwright, Supabase CLI or git), so no stage could reach "Done when:" or be verified/committed. Writing unverified code would break the "never mark green without running" rule.
Needs from you:
- Expose the Figma AI Bridge Executor tools (Soledrop (Local) plugin) to the agent session, or attach a `design/` export (handoff §4).
- Run the agent with a shell tool (PowerShell/Bash) enabled so it can install, build, test and commit locally.
- Figma file key/link for docs/app/design-source.md.
Continuing: none. Resume at Phase 0 when the above is available.

## 2026-11-03/04 — Phase 0 unblocked, Stages 1–7
Source: Figma plugin (Soledrop (Local)), read only; screens, tokens, icons and photos exported into `design/`. Owner frames were not modified.
Built (details in design-decisions D-001…D-036 and journey-audit J-01…J-25):
- Storefront: home, listing, pre-loved, product pages (new/pre-loved), contact, FAQs, size guide, bag (empty/filled), search, content pages, 404/500.
- Commerce: checkout (COD, bank transfer, Stripe reference adapter behind a flag), atomic idempotent orders, order page/lookup/cancel/returns, accounts (register, sign-in, reset, addresses, export, erasure).
- Data seam: `server/<domain>` with fixtures and Supabase repositories selected by `DATA_DRIVER`.
- Database: `supabase/migrations` (42 tables, RLS deny by default, SECURITY DEFINER staff-role pair with `search_path=''`, all RPCs), and `supabase/seed.sql` generated from the fixtures.
- Platform: outbox + signed webhooks, flags, rate limits, idempotency, audit, `/api/health`, `/api/ready`, `/api/jobs/*`, `/api/v1` + OpenAPI, CSV import/export, B2B price list behind a flag.
- Hardening:
  - `next.config.ts`: standalone output, CSP without nonces (D-033), HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP.
  - `instrumentation.ts`: production exits on an invalid environment; JSON error logs carry digests.
  - Bank transfer is hidden in production until real details are set.
  - Products and content pages use ISR, with real 404/307 statuses; `loading.tsx` only where safe.
- Hand-off: `.env.example` (checked by a test), Dockerfile, `.dockerignore`, `supabase/config.toml`, `docs/DEPLOYMENT-RUNBOOK.md`, `docs/app/{phase-2,data-model,api,caching,events}.md`.
Verified (production build unless noted):
- tsc ✓; eslint (0 warnings) ✓.
- vitest 70/70 ✓: RPC/contention 26, RLS 8, seed 2, unit/architecture/integration 34.
- `next build` ✓ (47 routes).
- Checkout journey and page smoke in Chromium under the CSP, with no CSP violations ✓.
- axe WCAG 2.2 AA: 0 violations on 16 routes × 1920/390 ✓.
Not green:
- Pixel QA fails on every screen. Photos (PX-01) and glyphs (PX-02) are not proven; the residue is in PX-04. See `qa/defects.md`.
- Pending: geometry audit, device matrix, WebKit/Firefox.
Blocked:
- No Docker, Supabase CLI or Postgres server, so `supabase start`/`db reset` and parallel-connection lock tests can't run. PGlite serialises calls.
- No git commit (session policy).

## 2026-11-07 — Admin A1: foundation (identity, RBAC, shell)
Built (admin-decisions A-001…A-013):
- Migration `20261107090000_admin_foundation.sql` (additive): staff identity columns, `permissions`, `roles`, `role_permissions`, `staff_roles`, `staff_invites`, `staff_sessions`, audit context columns, `has_permission()` (SECURITY DEFINER, `search_path=''`), deferred last-Owner triggers, RPCs `sync_admin_registry`/`save_role`/`delete_role`/`set_staff_roles`/`active_owner_count` (service role only), RLS on every new table.
- `server/admin`: permission registry and ten preset roles, repositories for both drivers, service (password + mandatory TOTP with recovery codes, AAL1/AAL2 sessions with 30-minute idle / 12-hour absolute timeouts, lockout, rate limits, step-up, invites, staff and role management, no privilege escalation, audit with actor/role/IP/UA/request id/reason), DAL, `adminRoute` wrapper (declared access, own-Origin check, no-store).
- `proxy.ts`: optimistic cookie check for `/admin` and `/api/admin`, per-request nonce CSP (`lib/admin-csp.ts`), no-store, noindex.
- UI: sign-in, MFA setup (QR) and verification, invite acceptance, shell with the permission-filtered module registry, dashboard placeholder, no-access, account (sessions, sign out everywhere, password, recovery codes); shared components (PageHeader, StatusPill, EmptyState, AdminCard, ConfirmDialog, StepUpProvider, form controls).
- Tooling: `pnpm admin:docs` (generates `docs/app/admin/permissions.md`), `pnpm admin:create-owner` (local Supabase only), `.env.example` now committed (it was gitignored), DEMO staff for QA (`ADMIN_DEMO_STAFF=on` in `qa/serve.mjs`).
Verified:
- tsc ✓; eslint (0 warnings) ✓; vitest 149/149 ✓ (new: admin DB 8, admin auth integration 14, registry/TOTP RFC 6238/crypto 13, admin CSP 2, admin architecture 4).
- `next build` ✓ (every /admin route dynamic).
- Playwright Chromium on the production build: admin-auth 7/7, security 4/4, journeys 14/14 ✓.
Not run: Firefox and WebKit (browsers not installed on this machine).

## 2026-11-08 — Admin A2: orders
Built:
- `server/orders`: staff search (number, email, name, phone; status, payment, method, date range; four sorts; paging), refunds list, return approve/reject, staff notes. Both drivers, plus migration `20261108090000_admin_orders.sql` (`order_notes` with RLS, search indexes, `orders:read`/`payments:read` read policies for RBAC staff).
- `server/orders/staff.ts`: permission per target status, cancel needs a reason, shipping needs a tracking number, stale-edit conflict check (`updated_at`), offline payments (idempotent), refunds (step-up and the role's ceiling), returns, notes, CSV export (formula-safe: `server/import-export/csv.ts` now neutralises `= + - @` cells for every export). Contact details are masked without `customers:read_pii`. Every action writes an admin audit entry.
- UI: `/admin/orders` (quick views, search with `/`, filters and sort in the URL, server-paged table, CSV export), `/admin/orders/[number]` (items, returns, merged timeline, notes, actions offered by permission with dialogs: next status, record payment, refund with step-up, cancel with type-to-confirm and reason), packing slip print view.
- Shared components: DataTable, Pagination, FilterBar, Timeline, DetailLayout, FormDialog.
Verified: tsc ✓, eslint ✓, vitest (admin orders integration 6, admin DB 9 incl. order notes RLS) ✓, `next build` ✓, Playwright Chromium admin-auth 9/9 + admin-orders 3/3 ✓.

## 2026-11-09 — Admin A3: products, collections, inventory, media
Built:
- Catalogue repository (both drivers): staff search over every status, by-id reads, `saveProduct` (migration `20261109090000_admin_catalog.sql`: `save_product` RPC with millisecond optimistic concurrency, slug/SKU uniqueness, ordered sizes protected), delete for never-ordered products, `save_collection` RPC, brands. Inventory levels + movements ledger (fixtures now record movements like `adjust_stock`). Media domain (`server/media`): index table with RLS, Supabase Storage / in-memory files, sharp re-encoding (A-014), public `/media/<id>.webp` route.
- `server/catalog/staff.ts`: product create/edit (drafts, prices behind `pricing:write`, A-015), publish/unpublish/archive with readiness checks, delete (step-up), collections (manual picks, rules), stock adjustments with reason and bag-hold floor, import/export wrappers; audit + storefront refresh (A-016).
- UI: products list (views, search, type filter, stock and price), product editor (details, media picker with upload, card photo and order, sizes and prices table, collections, tags, SEO, dirty guard, conflict banner, publish/archive/delete), CSV import with dry run, collections list/editor (RuleBuilder, product search), inventory with low/out views and adjust dialog with ledger, media library (drag-and-drop upload, alt text, delete when unused).
- CSV export now neutralises formula cells for every export (done in A2) and staff search terms are sanitised in one place (`server/db/supabase.ts#searchTerm`).
Verified: tsc ✓, eslint ✓, vitest 165/165 ✓ (admin catalogue integration 8, save_product DB test), `next build` ✓, Playwright Chromium admin-auth 9 + admin-orders 3 + admin-catalog 2 + journeys 12 + security 4 = 30/30 ✓.

## 2026-11-09 — Admin A4: customers
Built: customer search for staff (email, name, phone digits; wholesale and marketing views) on both drivers; `server/customers/staff.ts` (detail with orders, addresses and lifetime stats; edits of name/phone (PII holders only), price group and consent with an audit diff; sign out everywhere; data export and erasure behind `customers:export` / `customers:delete`, step-up, reason, type-to-confirm). Contact details are masked without `customers:read_pii`. UI: `/admin/customers` and `/admin/customers/[id]`.
Fixed: the fixtures order search's phone-digit match had lost its regex escape (`/D/` instead of `/\D/`); a test now covers it.
Verified: tsc ✓, eslint ✓, vitest (all suites) ✓ — admin customers integration 3, orders phone search.

## 2026-11-10 — Admin A5: promotions, shipping, tax
Built: promotions repository writes (both drivers; codes unique case-insensitively, `times_used` never written by staff, used promotions can only be switched off); `server/promotions/staff.ts` (states live/scheduled/ended/off/used up, save with limit ≥ uses, on/off, delete unused, readable code generator, simulator running `evaluatePromotions` — the checkout engine — on a test bag); shipping zones with rates and the tax table (migration `20261110090000_admin_shipping.sql`: `save_shipping_zone`, `replace_tax_rates`, RBAC read policies on promotions), `server/shipping/staff.ts` with a rate tester using checkout's `zoneFor`/`quoteRates`/`taxFor`. UI: promotions list/editor (condition and benefit builders, schedule in Pakistan time, try-it panel), redemptions; shipping & tax page (zones, delivery options, free-over thresholds, COD, tax table, tester). Pricing (base and wholesale price lists) stays in the product form for now; price lists themselves are read-only (A-015).
Fixed during the stage: a lower usage limit was accepted for a previously unlimited promotion that had already been used.
Verified: tsc ✓, eslint ✓, vitest 173/173 ✓, `next build` ✓, Playwright Chromium admin-auth 9 + orders 3 + catalogue 2 + modules 1 = 15/15 ✓.

## 2026-11-10 — Admin A6: payments
Built: the store-wide money ledger (payments and refunds with order numbers, both drivers), provider status (which methods checkout offers and what each needs), the bank-transfer queue (pending bank-transfer orders, oldest first, flagged after two days) with "Received" reconciliation (idempotent, audited, confirms the order when paid in full), and today's takings. Page `/admin/payments`. FilterBar search is now optional.
Verified: tsc ✓, eslint ✓, vitest (all) ✓ incl. staff payments integration.
