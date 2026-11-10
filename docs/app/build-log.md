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

## 2026-11-11 — Admin A7: content
Built: staff content repository writes (both drivers; migration `20261111090000_admin_content.sql`: `save_page` with rename + millisecond optimistic concurrency, `reorder_faqs`, RBAC read of drafts). Pages now have a published flag (seed pages published; drafts hidden from `/pages/<slug>`). `server/content/staff.ts`: pages (draft → publish, rename, delete; policy slugs reserved, A-017), FAQs (add, edit, delete, reorder). UI: `/admin/content` (pages + policy links), block editor (heading, paragraph, list, callout, button link — on-site only, FAQ group) with a live preview in the storefront's own block renderer, `/admin/content/faqs`.
Verified: tsc ✓, eslint ✓, vitest (all) ✓ incl. admin content integration 3.

## 2026-11-12 — Admin A8: marketing, search, reports
Built: newsletter list (both drivers; masked without PII access) with CSV export behind `marketing:export` + step-up + reason; abandoned bags (active carts with lines untouched for 2 h, valued at base prices); search report (searches, zero-result share, clicks, top and zero-result queries — migration `20261112090000_admin_reports.sql`: `search_report`, RBAC reads on the search log and newsletter) and synonyms editor (fold-normalised, unique terms; a zero-result query links straight to "Add synonyms"); reports over a Pakistan-day range (net sales, orders, AOV, pairs, refunds, by day, brand new vs pre-loved, payment methods, best sellers, codes used, stock value at base prices) with CSV export. `server/shared/revalidate.ts#refreshStorefront` replaces direct `revalidatePath` calls so services run outside a request (tests, jobs). The architecture test now reads `adminRoute(...)` declarations across line breaks.
Verified: tsc ✓, eslint ✓, vitest (all) ✓ incl. reports/marketing/search integration 3, `next build` ✓, Playwright Chromium admin suites 15/15 ✓.

## 2026-11-13 — Admin A9: settings, staff & roles, audit, notifications, command palette
Built: platform repository writes (flags, audit search incl. system entries, outbox summary with failed events and recent webhook deliveries, retry) on both drivers; `server/platform/staff.ts` (flags with env-override awareness, read-only integrations without secrets — A-018, outbox and jobs on demand, health, audit search); `server/reports/insights.ts` (attention list — A-019 — and the command palette search, both permission-filtered). UI: Settings (store & features, integrations, emails/webhooks/jobs, health), Staff & roles (members, invites with a one-time link, member page with roles / suspend / MFA reset / sessions, roles list, role editor with the PermissionMatrix and no-escalation greying), Audit log (filters, expandable entries with DiffViewer, reason, roles, IP, UA, request id), notification bell, ⌘K / Ctrl+K command palette. Every sidebar module now has a page (architecture test).
Verified: tsc ✓, eslint ✓, vitest 185/185 ✓, `next build` ✓, Playwright Chromium admin suites 17/17 ✓ (incl. invite → MFA enrolment → suspension end to end, and the palette).

## 2026-11-13 — Admin A10: dashboard
Built: `/admin` shows today's net sales, orders and pairs against the 7-day daily average (reports:read), the last 7 days' totals, the attention list (A-019), latest orders (orders:read), this week's best sellers, and recent audit entries (audit:read); members without those permissions see their modules instead. New StatCard component.
Verified: tsc ✓, eslint ✓, vitest 185/185 ✓, `next build` ✓, Playwright Chromium admin-auth + modules + orders 13/13 ✓.

## 2026-11-13 — Admin A11: hardening
Built / fixed:
- `e2e/admin-permissions.spec.ts`: every preset role signs in for real and calls 24 admin APIs and opens 17 module pages; each answer matches `server/admin/permissions.ts` (10/10 roles pass).
- `e2e/admin-a11y.spec.ts`: axe WCAG 2.2 A/AA on the sign-in screen and 22 admin pages at 1440 and 390 px, plus a no-sideways-scroll check at 390 px. Fixed on the way: sidebar group labels' contrast on the dark sidebar, unnamed top-bar buttons on phones (labels now `sr-only` below `sm`/`md`), the danger status pill's contrast, and wide tables pushing phone pages sideways (`min-w-0` on admin fieldsets, cards and grid columns).
- `server/admin/route.ts`: 120 writes per minute per staff session.
- Architecture: admin code can't be imported by storefront routes or components; DB: the anon role reads nothing from any admin table and nobody reads staff sessions.
- `docs/app/admin/security.md`: threats, controls and the test that proves each.
- Flaky test fixed: the content rename test could create and rename within one millisecond, so the stale save looked fresh.
Verified: tsc ✓, eslint ✓, vitest 187/187 (×4 for the integration suites) ✓, `next build` ✓, Playwright Chromium admin suites incl. permission matrix and a11y ✓.

## 2026-11-06 — Admin A12/A13 resume checkpoint (in progress)

Resumed from local commit `8c52cd5` and Claude's interrupted QA/documentation session. Earlier admin entries use stage dates 2026-11-07…13; this continuation records the actual client date and leaves that history intact.

- The interrupted Chromium pass was 966 passed / 2 failed (971 cases after expanding checkout coverage). BUG-018: bag savings contrast; BUG-019: keyboard test focused the dropdown rather than the tab. Both fixed with regression coverage.
- The first resumed pass exposed BUG-020: a sort trigger's accessible name during hydration. Added a direct accessible label and a no-JavaScript regression check; a new production build and full reruns are required after that fix.
- Completed the sample component gallery, added it to module smoke/axe sweeps and checked that its sample edits make no store writes.
- `pnpm.cmd verify` passed typecheck, zero-warning lint, 187 tests and production build before the BUG-020 change. Theme sync/contrast passed. The separate design gate still fails G3 (missing Figma Theme collection, P2-12).
- Firefox and WebKit installed for the remaining browser runs. Reports, final limitations and local commits are pending.

### A12 follow-up checkpoint — CSP and inventory (full reruns pending)

- The cross-browser attempt exposed BUG-021 (Zod's dynamic-code probe violates the nonce CSP in Firefox) and BUG-022 (checkout holds surviving bag changes, plus Supabase release deleting rows without restoring reserved counts). The red attempt was interrupted to apply fixes; it is not a clean pass. Its log is preserved locally as `qa/a12-before-csp-stock-fixes.log`.
- Browser validation now runs the shared `lib/validation.ts` setup before Zod schema construction; it enables `jitless` without relaxing CSP. The architecture suite guards setup order. The auth browser test records actual `securitypolicyviolation` events as well as console messages.
- Cart line/quantity changes release prior holds. Supabase uses the existing `reserve_stock` RPC with an empty replacement; integration and PGlite tests cover stock restoration, repeated release, and isolation from another cart's holds.
- Typecheck, lint, 191 tests and production build passed with these fixes. The targeted production-browser regressions passed 18/18 across Chromium, Firefox and WebKit (no skips). The validation setup was then adjusted to preserve tree shaking; verify is running again before full reruns.
- Admin script-size measurements are recorded as PERF-03. A namespace re-export temporarily increased bundle size; that form was removed, and final bundle sizes are still to be measured. The strict performance target remains open.

### A12 follow-up checkpoint — WebKit hover

The first completed cross-browser attempt was 2,867 passed / 48 existing skips / 1 failed in 17.9 minutes. Its remaining failure was BUG-023: the sort option intermittently lacked its hover colour in WebKit. Its report/log are preserved locally as `qa/out/a12-before-hover-fix.json` and `qa/a12-before-hover-fix.log`.

Added CSS hover colours on the shared select item using the existing brand tokens, retaining data-driven keyboard highlighting. `pnpm.cmd verify` passed again (191 tests, typecheck, zero-warning lint, production build). The existing WebKit hover regression then passed 20/20 repetitions. Two full configured browser passes on this final code are now pending; no application code should change during those runs unless another failure requires it.

### A12 final-code pass 1 — clean

`pnpm.cmd verify` passed on the hover-fixed code: typecheck, zero-warning lint, 191 tests in 23 files and production build. The complete configured Playwright suite then passed with **2,868 passed / 48 existing skips / 0 failed** in 17.7 minutes. Report: local `qa/out/a12-full-pass1.json`. The skips are the existing duplicate TOTP-limited admin suites in Firefox/WebKit; core auth/CSP and all configured storefront suites ran in those browsers.

The QA server is being reset and verify repeated before a second full browser pass. A12 implementation is being saved as a local checkpoint; final automated QA results and A13 documentation remain pending. The original strict zero-open-findings sign-off remains open for the documented performance/design/verification gaps.

## 2026-11-06 — A12 automated regression checkpoint complete; strict sign-off open

Implementation: local commit `8777e34` (QA fixes and component gallery). Resolved BUG-018–BUG-023: sale-savings contrast, the New Arrival keyboard regression, sort naming during hydration, Zod/CSP compatibility, checkout reservation release (including Supabase counters), and WebKit sort hover. Shared components are previewed at `/admin/dev/gallery`; sample edits do not submit store writes.

Verification on the final code:
- `pnpm.cmd verify` passed before each full browser pass: typecheck, zero-warning lint, 191 Vitest tests across 23 files (including PGlite DB tests), production build.
- Full configured Playwright pass 1: **2,868 passed / 48 existing skips / 0 failed**, 17.7 min.
- Full configured Playwright pass 2, fresh fixtures: **2,868 passed / 48 existing skips / 0 failed**, 17.5 min.
- Both reports have zero runner errors and zero reported flaky cases. Each pass: Chromium 972 passed; Firefox 948 passed + 24 existing skips; WebKit 948 passed + 24 existing skips.
- Focused CSP/cart regressions: 18/18 across all three browsers. WebKit hover regression: 20/20 repetitions.
- Gallery production screenshots reviewed at 390 and 1440 px. Theme sync/declared contrast pairs pass. The design gate still fails G3 (missing source Figma Theme collection, P2-12).

Local raw reports: `qa/out/a12-full-pass1.json`, `qa/out/a12-full-pass2.json`, `qa/out/a12-targeted-final.json`, `qa/out/a12-sort-hover.json`. Generated test output/logs are ignored; obsolete generated error contexts were removed from Git tracking.

Remaining requirements (not claimed complete): PERF-03 (final admin initial JS 338.5–343.2 KiB vs 250 KiB), prior storefront performance/design findings, source design gate G3, broad export step-up coverage, exhaustive mutation/role and failure-atomicity checks, real Postgres concurrency/hosted integrations, large-data latency/INP, committed full screenshot baselines and real-device/screen-reader checks. Details: `docs/app/admin/verification.md` and `qa/bugs.md`. The original strict zero-open-findings definition for A12 has therefore **not** been met.

## 2026-11-06 — A13 documentation complete

Completed the admin bootstrap/operations runbook, Admin API reference, current data model/RLS matrix and reservation semantics, cache invalidation notes, component capabilities, navigation registry description and security/verification limits. Corrected stale claims about compact tables, a shortcuts sheet, automatic draft recovery, policy editing, JSON product imports and which exports require step-up. Phase 2 and the build plan now distinguish the implemented core and clean automated regressions from outstanding sign-off requirements.

Resume at the remaining A12 performance/security/coverage requirements in `docs/app/admin/verification.md`; the earlier module implementations and this completed regression checkpoint should not be rebuilt. Changes are local only. No push, deployment, remote database changes, real emails or live payments were performed.

## 2026-11-07 — A14: saved catalogue and all displayed banner controls

The owner chose to retain the existing live catalogue. Exported the running preview before stopping it, then imported its 20 products with stable IDs/SKUs/prices/on-hand balances, eight collections, seven prior uploads and the existing order/payment/return records. Product and merchandising photos now use 36 saved media records. The saved express-delivery flag was retained; the audited stock adjustment was recovered with explicit provenance without changing balances. A private Owner replaces known demo accounts in the saved store.

Normal local operation now uses a single-process saved file driver with a shared queue, checksummed snapshots, atomic replacement, write rollback and an exclusive process lock. Media files persist beside it. Restarts never reseed products. Fixtures, sample image files and generated sample SQL are isolated under explicit QA operation; the normal Supabase bootstrap contains only operating configuration. Hosted operation remains the existing Supabase repository path.

Added Content → **Banners & images** with links to homepage hero/category/Instagram controls and every collection/page banner editor, including New Arrivals, Pre-Loved and Sale. Homepage announcement/title/description/buttons are editable. Collection banners support upload/choose/replace/remove and alt text. Media pagination reaches the full library; used photos show their references and cannot be deleted from products, collections, homepage or order history. Public rendering reads current admin data per request.

QA found and fixed long merchant-text overflow/clipping and a WebKit early-hydration Media search reset. The old broad-suite promotion assertion was made exact after its substring matched explanatory text too. A duplicate older development server on 3000 was stopped after verifying its project command line; the saved preview on 3200 then passed readiness and live route checks.

Validation:
- Typecheck, zero-warning lint, production build and **200 tests in 25 files** passed. The minimal SQL bootstrap was additionally checked for base-currency configuration and editable disabled integration flags.
- Broad three-browser regression: **2,868 passed / 48 existing skips / 0 failed**, 17.8 minutes, no runner errors or reported flaky cases. Earlier pass: 2,867 passes and the one corrected selector failure.
- Latest-build dedicated banner regression: **12/12 passed** across Chromium, Firefox and WebKit, including mobile widths, axe, maximum-length text, category creation, page banners, library pagination, usage/delete controls and permissions. The affected WebKit flow passed two additional consecutive repetitions after the hydration fix.
- Private-copy hard-restart checks passed for sessions, upload bytes, prices, stock, homepage/page banners, existing order history, renaming, unpublishing and deletion. An empty catalogue stayed empty and rendered safely. A direct import comparison retained all seven prior uploads byte for byte and matched IDs/prices/stock/order records.
- Closing changes to the storage label, category sizing and hydration were rebuilt and verified with targeted checks; the broad suite was not repeated after those final fixes. Raw reports and screenshots remain ignored/private, listed in `admin/verification.md`.

The current local store and credentials are private under `.data`, with stable secrets in `.env.local`; neither is committed. See `admin/catalogue-and-banners.md` for operation, backups and bootstrap instructions. Strict A12 performance, source-design and hosted-integration requirements remain open as previously documented. No remote database, deployment, push, real payment or email was used.

## 2026-11-07 — M0: migration inventory and preserved baseline

Baseline commit: `8bdc580`. Inventoried the final legacy schema: 53 tables, 423 columns, 563 constraints (including 360 NOT NULL constraints), 105 indexes, 77 policies, 52 declared functions, four non-internal triggers and 15 enum types. All 13 repository domains and 154 methods have replacement stages. The inventory also maps vendor mentions, authentication, storage, environment, dependencies and existing SQL test intent.

The twelve universal contracts are frozen with SHA-256 digests recorded in the inventory. No vendor-specific lines were found in those contracts. The Hostinger checklist separates public product information from unverified account facts. Better Auth documentation was reviewed; the first-party fallback is selected to preserve hashed opaque sessions and mandatory staff assurance across authentication flows.

Validation: typecheck and zero-warning lint passed; baseline Vitest passed 200/200 tests. Preserved an independent standalone artifact (dependency junctions retargeted within the archive), public/static assets, a private saved-store copy and environment backup under ignored `.data/mysql-migration/baseline`. Protected-contract digests still match. Existing strict design/performance findings remain visible; these baseline checks do not claim migration acceptance.

Docker and installed database binaries were absent. Official portable Windows engine downloads are in progress for loopback-only test instances. Next: M1 schema, tools and real-engine validation. No application code changed in M0; no remote database, hosting account, deployment, email, payment or push was used.

## 2026-11-07 — M1: common database foundation

Initialized task-owned portable MySQL 8.0.46 and MariaDB 10.11.15 on loopback ports 3307/3308. Root passwords and separate migrator/app credentials are private and ignored. Both real engines applied the two common migrations. The schema retains the 53 legacy tables and fields, normalizes eight arrays into child tables, and adds attribute/search/counter/auth/media projections and store metadata. Existing UUIDs import unchanged; new UUIDv7 uses BINARY(16). Integer mapping rejects unsafe precision. MySQL >=8.0.16 is the actual floor because earlier releases ignore CHECK constraints.

Added Drizzle/mysql2, portable mappings, a small process pool with strict UTC sessions, transaction context and bounded idempotent retries, migration parser/ledger/checksums/advisory lock, guarded local reset, idempotent operating seed, portable/Docker start-stop profiles, migration lint and phpMyAdmin bundles. Database app grants exclude DDL and audit UPDATE/DELETE. No runtime driver switch yet: repository migration and private data import are M2/M3; the existing store remains preserved.

Verification: 16 real-engine foundation cases passed (eight on each engine), covering replay, checksum tamper, competing migrators, UTC/strict mode, complete schema, grants and append-only audit, foreign keys, normalized values, stock and money constraints. Four primitive cases passed, including a 10,000-key UUID burst and version rejection. Repeated operating seed succeeded without adding products. Full existing/unit suite passed 204/204, typecheck, zero-warning lint, portable SQL lint, bundle generation and production build passed. Reports are private under `.data/mysql-migration`.

Found and fixed during validation: TEXT defaults require expression syntax on MySQL; stored generated uniqueness guards conflict with cascading foreign keys, so both filtered unique equivalents use virtual generated columns. MySQL returns OCTET_LENGTH as a string with safe BIGINT options; assertions normalize the metadata number explicitly. The existing preview's Sharp DLL blocked the first build; only its verified project processes were stopped, then the build passed. No original catalogue or UI source was changed.

Next: M2 actor-required repository boundaries, relational domain implementations and shared contracts; M3 transactional business operations and concurrency. Host-specific facts and full regression/performance acceptance remain unverified. No push, deployment, remote database, real mail or payment.

## 2026-11-07 — M2: relational repositories and private import

Implemented all 13 MySQL repository factories against the 154-method domain contracts. Their raw MySQL signatures require an explicit typed Actor through ActorScoped; service injection has a typed binding helper. Public, owner, staff, job, authentication and migration scopes are distinct. Query predicates include deployment store/ownership, and staff PII projections are masked before returning database rows. Mandatory conversion of the older fixture/interface/request boundaries is M5; the runtime remains on the original local driver until that work is complete.

Added relational mappings for all domain DTOs, transactional catalogue/collection writes and indexed attribute projections, customer/staff identities, sessions/invites/roles, cart and inventory, checkout/payment/refund/return operations, content, search analytics, outbox/rate limits/audit, and persistent media bytes. New application keys now use UUIDv7. SQL business operations and actor/grant enforcement need the repeated M3 races and M5 security matrix before acceptance. M6 finishes storage variants, external references and adapters; the initial local-disk byte adapter is included here because the private import requires it.

Verified the final source snapshot after stopping the preview: **20 products, eight collections, 37 media records, two staff members, six staff sessions and one order**. These actual counts supersede the older A14 summary's 36-media/one-Owner checkpoint. The final copy has the same digest as the original preserved baseline. Imported into new, task-owned `soledrop_migration_verified` databases on both engines, retaining IDs, money, stock, product/banner content, order/payment/return history, identity hashes, sealed MFA, recovery hashes and session records. Every uploaded byte was copied and compared. `verify-local-import.ts` completed **3,574 comparisons per engine, zero differences**, including credential material compared only in memory. Original snapshots/media/env remain untouched and private. Earlier validation import databases are not active and were not overwritten.

Current schema: six forward migrations. Additional indexes/historical FKs, contact projections, restock accounting, explicit empty-vs-unrestricted flag targeting, an import ledger and independent collection ordering preserve the source capabilities. Unscoped legacy audit entries are associated with their imported deployment store; expired legacy rate-limit buckets retain counts with an expired UTC bucket. This makes their ownership/window equivalents explicit. No session or MFA state was regenerated.

Validation: **70 database-suite tests passed**, comprising 18 shared behavior cases on fixtures/MySQL/MariaDB (54 runs) plus 16 real-engine foundation cases. Cases cover all 13 domains, including image-byte roundtrips, duplicate-image uploads, full product DTOs, draft/stale saves, shipping order, money, customer/staff sessions, last Owner, checkout replay/stock, payments/refunds/returns, jobs and analytics. The original suite passed 204/204. Typecheck, zero-warning lint, SQL lint, bundles and production build passed. Private reports: `m2-all-contracts.json`, `m2-unit.json`, `private-preservation-full.json` under `.data/mysql-migration`.

Found/fixed: membership query order differed from the source arrays (separate product and collection ordering); shipping rates used index order instead of source order (explicit UUIDv7 insertion order); empty flag targeting lost its distinction from unrestricted targeting (explicit boolean); supported alt/question lengths exceeded the initial VARCHAR mapping; relative source-maintenance imports needed resolver support. Shared regression assertions cover the ordering cases. The fixture product clock is monotonic so a same-millisecond save cannot defeat stale-edit detection. Test cleanup now respects deliberate historical foreign-key restrictions rather than disabling them.

Next: M3 repeated multi-connection races and transaction failure tests, then authentication, request authorization, adapter completion and the final driver switch. Full production QA on the new driver, large-data performance and all prior open findings remain outstanding. No push, deployment, remote database, real email or payment.

## 2026-11-07 — M3: transaction races and rollback/retry drills

Added real-engine, two-connection race tests. Every race establishes a REPEATABLE READ snapshot before the competing writers and proves distinct connection IDs. Ten scenarios × 50 iterations × two engines: last physical unit, same checkout key, global coupon limit, per-customer coupon limit, first-order eligibility, expiry versus checkout, concurrent refunds, last Owner, optimistic product edits and optimistic order edits. Final result: **1,000/1,000 race iterations passed**. Full database suite: **1,078/1,078**, including shared contracts/foundation and eight real failure-drill cases. A deliberately induced deadlock retries safely without duplicate increments; a real lock-wait timeout retries after rollback; business errors never retry; missing/unbounded idempotent retry configuration is rejected.

The first 800-race run found 300 failures across three repeatable-read defects on both engines: old-snapshot replay, per-customer redemption counts and Owner counts. Fixed with current locking reads after the common store lock, including order children/replay results. The same 800 races then passed; expanded first-order and optimistic order races pass in the final suite. This evidence is independent of PGlite/fixtures.

Also fixed duplicate payment events/state regression, financial ceilings using captured money, physical restock overlap across return/refund/cancellation, and order version checks moving inside the transaction. Fixtures preserve those corrected invariants. Actor labels accept the existing canonical staff:id history format while rejecting a different staff identity. No external effect is inside a retry callback. No migration SQL was changed in this stage.

Validation: 204/204 original/unit tests, typecheck, zero-warning lint and production build passed. Reports: `.data/mysql-migration/m3-final.json`, `m3-unit-final.json`, `m3-races-initial.json`, `m3-races-fixed.json`. The production UI remains on the preserved local driver until M4/M5 request/auth context is complete. This is database transaction acceptance, not the final full-production sign-off. The provider-facing refund workflow still needs a durable pre-call reservation/reconciliation check during the admin/integration stage, using local fake providers only.

Next: M4 maintained TOTP and auth hardening; M5 required actors at every driver/interface/request seam, current session/grant checks, permission/ownership matrices and stricter grants; then remaining adapters, retirement, packaging and complete QA. No push, deployment, remote database, real email or payment.

## 2026-11-07 — M4: authentication services and hardened HTTP boundaries

Replaced hand-maintained TOTP calculations with otplib 13.6.0 while retaining existing enrolled-secret format and RFC behavior. New passwords use the OWASP scrypt 32 MiB profile (N=32768/r=8/p=3); imported hashes verify and upgrade with compare-and-set writes that preserve other valid sessions. Added a documented limited offline weak-password check. The random dummy hash is warmed at startup; exact production timing distributions remain a later HTTP acceptance check.

Resets, invites, enrolment/proof consumption, password/session rotation and mandatory audit writes now share units of work. Failed-login counters commit separately from the credential error. Concurrent recovery/TOTP consumption uses optimistic guards. Credential rechecks prevent an older password proof from opening a session or changing/deleting an account after a concurrent password change. Staff password changes rotate the cookie while preserving the real earlier MFA time. Repository guards and migration 0007 enforce session assurance. Customer/staff realms remain separate; exact-Origin checks cover every cookie realm and public auth mutations. New email-link payloads are purpose-separated AES-GCM sealed at queue storage and excluded from third-party webhook data.

Added config-gated magic links, email verification and optional OIDC using openid-client 6.8.9. No new screens or controls were added. Magic sign-in requires the initiating browser proof; verification alone cannot create a login. OIDC requires PKCE/state/nonce/browser proof and validated signature/JWKS, issuer, audience, expiry and verified email. Existing accounts never auto-link by email. PKCE proof is sealed, state is hashed/single-use and provider access/refresh tokens are not persisted. Added customer session list/revoke and password-confirmed email change; account erasure removes the new authentication metadata. Optional IP/CIDR restrictions apply to staff login/DAL requests and denied access is audited.

The rewritten Owner CLI is local/SSH-loopback only, refuses an existing active Owner under a store lock, revokes older unused bootstrap links, prints a one-time set-password link and stores only its hash. Real-engine CLI tests prove replacement/refusal and remote-address rejection; the preserved merchant Owner is unchanged. Detailed decisions, endpoints, library references and limits are in `auth-migration.md`.

Validation: **1,130/1,130 full real-engine/fixture database checks**, including the existing 1,000 repeated races; **228/228 full original/unit checks**; the final auth/commerce erasure follow-up is **75/75** across fixtures/MySQL/MariaDB. Typecheck, zero-warning lint, SQL lint/bundles and the final production build passed. The shared auth suite has 16 cases × three adapters (48), including actual rollback/concurrent consumption; four CLI cases run on the real engines. Ten OIDC protocol cases intercept all outbound requests locally. Four HTTP-boundary cases invoke the actual cookie writers and Origin wrapper, verifying production flags and no-cache behavior. Reports are under `.data/mysql-migration/m4-*.json`. A fixed-clock fixture test initially disagreed with wall-clock repository expiry; it now injects its existing clock into both layers, retaining every original assertion.

All twelve frozen contracts still match their baseline hashes. The original private saved-store digest remains `b1060b8149b1c6b6f817302449ee5a331ece746227f8dabffb3c655c272c8f3e`. No TSX/layout/copy was changed. The new driver is still isolated from the saved storefront runtime until M5 request/actor integration; this is an authentication-stage checkpoint, not whole-migration or browser/performance acceptance.

Next: M5 required actor types/factories for both retained drivers, request/RSC context, live session/grant revalidation at raw MySQL calls, ownership/permission matrices and stricter append-only grants. Then remaining adapters, admin transaction/integration work, retirement/readiness, Hostinger package and the full QA loop. No push, deployment, remote database, real email or payment.

## 2026-11-07 — Requested banner text removal

The owner explicitly requested removal of the small banner line shown as “JUST DROPPED · 19 NEW PAIRS” everywhere on the site. Removed the shared CollectionBanner eyebrow prop/rendering and the New Arrivals/Sale tagline calculations. This is an authorized UI change to the earlier migration baseline; the headline, description, images and product tabs remain. Preserve this requested change when completing migration parity checks.

Validation: typecheck, targeted zero-warning ESLint and production build passed. Restarted the local preview and checked all ten public banner/listing routes from the sitemap at desktop 1440 px and mobile 390 px: twenty checks passed, no eyebrow text and no horizontal overflow. Local screenshots and results are in `.data/banner-without-tagline-*.png` and `.data/banner-tagline-verification.json`. Migration M5 remains in progress; this UI change does not claim its acceptance.

## 2026-11-08 — M5 authorization and request integration

All thirteen retained fixture factories now require actors, with complete typed guard maps, isolated store datasets and live staff session/grant attenuation matching SQL. All twenty-six fixture/MySQL factories are checked against their required-actor interfaces. Request/RSC contexts carry validated customer sessions, guest cart/order proofs and real staff assurance; missing context stays anonymous. Server authentication, verified payment results/webhooks, signed unsubscribe links, bearer API clients and authenticated cron jobs select explicit narrow system capabilities. API key identities are distinct even when display names match, and read endpoints cannot inherit write/staff administration authority.

The source driver now registers MySQL across all domains. Guest checkout replay retains proof after cart-cookie clearing, and customer/order/cross-store/cache ownership regressions run across the three adapters. Finance valuation has dedicated reports:read projections. Fixture role/credential/MFA-reset writes revoke sessions immediately, with single-use MFA/recovery guards matching SQL. Append-only audit, inventory movements, order notes, webhook delivery history and import ledger have SELECT/INSERT grants only; schema ledger is SELECT-only. The generated grant template and one-user hosting limitation are documented in db/README.md. Real-engine probes deny UPDATE/DELETE on every protected table and runtime DDL.

Validation: the complete database run is **1,190/1,190** (fixtures and both real engines, including 1,000 repeated races). Unit/integration checks are **1,660/1,660**, including **1,484 generated admin handler gate checks** across all preset roles, anonymous/customer, AAL1 and stale MFA. The handler matrix verifies the declared DAL gate, separate from actual business mutation/journey coverage. Typecheck, zero-warning lint and clean production build pass. MIG-015–018 record the masked-address, replay, Finance and artifact-tracing corrections. The clean standalone excludes private data and environment files; tracing warnings were eliminated by splitting the pure engine checker from migration filesystem utilities. Production browser, adapter, performance and failure acceptance remains M6–M10 work.

The working saved store contains newer catalogue/history edits than the original frozen baseline: 20 products, 44 media, two orders and ten staff sessions. It was copied privately after stopping its writer, then imported into separate new soledrop_migration_current databases on each engine. **3,758 field/byte comparisons per engine have zero differences**, including all 44 media objects. Current source digest is c61ce4d7977f203773a51dd5d03ce404fa4a855e1b3be3531a78a465e44815b0; the original b1060b… baseline and earlier verified databases remain intact. All twelve frozen universal contracts retain their original hashes. The MariaDB production preview at 127.0.0.1:3200 uses the new application user and persistent bytes; readiness, health, homepage, new arrivals and admin login return 200. This is a migration checkpoint, not final deployment readiness.

The owner confirmed Node.js/Web App availability and authorized a verified GitHub push followed by their Hostinger import. Continue through adapters, admin transaction/integration work, retirement/readiness, Hostinger delivery and the full acceptance loop before pushing. No hosting account, remote database, real mail/payment or deployment action has been performed.

## 2026-11-08 — M6 adapters and native catalogue queries

Added SMTP with verified TLS, private durable MIME sink, per-store hourly quotas and fenced per-channel outbox receipts. Successfully recorded email is not repeated when a different channel fails; stale lease completion is rejected. Quota and cooperative job-budget deferral preserve the failure-attempt allowance. Cleanup, reservation expiry and abandoned-cart work are bounded. Fixed expired idempotency entries that could never be refreshed and an unrelated expired-reservation backlog blocking a requested variant. SMTP's acceptance/receipt crash gap remains explicitly at least once.

Persistent media now prepares six widths in both WebP and AVIF at upload/backfill, uses a custom loader and cacheable format-negotiating ETag route, and never encodes on GET. Added symlink-safe atomic local storage, an optional SigV4 S3 reference, authorized short-lived private attachments, and loopback preparation/reindex tools. All 44 preserved images were prepared on both engines; original bytes and metadata remain unchanged. Runtime storage stays outside the application artifact.

Native catalogue queries now maintain FULLTEXT, vocabulary, field-position and SKU projections inside product transactions. Shared fixture comparison covers all sorts, facets, pricing contexts, manual/rule collections, fuzzy/synonym/SKU/size searches and long/Unicode text. Found and fixed case-insensitive collation conflating sharp s/ss, bounded projections splitting surrogate pairs, and both engines eliminating valid supplementary-plane LIKE prefixes through their range optimizer. Forward migrations 0008–0012 preserve applied checksums. Product versions are unchanged by reindexing. Large-data performance remains an explicit later acceptance requirement.

Validation: **1,739/1,739** full application tests and **1,378/1,378** database checks, zero pending; typecheck, zero-warning lint, SQL lint/bundles and production build passed. Native catalogue parity includes **176 cases** across both real engines. Production public smoke: **60/60** routes/browser/width combinations across Chromium, Firefox and WebKit, no findings. Browser processes needed native execution outside the restricted process sandbox; no application permission was weakened. The smoke assertion now waits for visible images and excludes hidden carousel slides, and uses a fresh page per route to avoid attributing cancelled prior-page prefetches to the next route. This is a stage checkpoint, not the full M10 acceptance loop.

Details and operational limitations: [adapter-migration.md](./adapter-migration.md). Next: M7 admin units of work and durable provider refund intents, then M8 retirement/readiness, M9 delivery and M10 complete acceptance. Private merchant source and frozen contracts are preserved. No push/deployment/remote service action yet.

## 2026-11-08 — M7 admin transactions and provider refund recovery

Explicit write-method units now include mandatory audit for staff catalogue, content, customers, roles, promotions, shipping, synonyms, settings and non-provider order operations. CSV imports also commit their audit with their changes; audit failures propagate. Post-commit invalidation is isolated between concurrent requests and discarded on rollback. External jobs record invocation before work and completion afterward. Media has dedicated reference projections for media:read, fixing Content Editor access to usage without unrelated catalogue grants. Upload processing/prepared bytes happen before the metadata/audit transaction; public reads avoid an enclosing service transaction.

Forward migration 0013 introduces durable refund intents. They reserve paid money/line quantities and audit the request before the provider call, freeze provider identity and use a stable scoped key. Provider calls remain outside retryable transactions. Confirmation survives later ledger/audit failure; final ledger/event/restock/completion audit commit together. Shared drills simulate a provider accepting money before losing its response, rejection of a competing/different-payload refund, audit rollback, service reconstruction and concurrent completion with one physical restock. Stripe read-only lookup uses durable metadata and verified status/amount. An older uncertain intent never issues another provider POST after the 23-hour safety margin. The loopback-only reconciliation command can recover a lost browser key without submitting a provider refund request. Pending/unsuccessful results remain reserved for investigation.

Production browser checks exposed build-inlined CSRF canonical URLs on independently configured runtimes. Added runtime SITE_URL for server Origin checks, authentication redirects, OIDC callback verification and email rendering; exact-origin rejection remains. The private QA helper selects separate staff identities per test and preset role on an isolated SQL database, using actual password/TOTP forms without altering merchant credentials or enabling demo staff.

Validation: **1,751/1,751** full application checks and **1,390/1,390** database checks, zero pending; typecheck, zero-warning lint, thirteen forward migrations/bundles/grants and final production build pass. **12/12** original production banner journeys pass across Chromium, Firefox and WebKit on isolated MariaDB, covering uploads, homepage/collection publication, referenced-media deletion, stale saves, read-only controls, 320/390/1440 containment and axe. The final read-only reconciliation extension also passes its targeted provider and shared real-engine checks. Private reports: m7-unit-final.json, m7-db-final.json and m7-browser-banners.json. Details: [admin-migration.md](./admin-migration.md). MIG-022–025 record the fixes.

This is the admin migration checkpoint, not final readiness. Next: M8 legacy retirement, complete schema/runtime readiness and pool deadlines; M9 Hostinger import package/private data handoff; M10 two complete production passes per engine, performance and failure acceptance. No push, deployment, hosting/remote DB action or real email/payment has occurred.

## 2026-11-09 — M8 legacy retirement and runtime readiness

Removed the retired backend SDKs, thirteen adapters, obsolete SQL/configuration and emulator harness.
All 60 original database-test intents have an explicit native replacement ledger; no pending test is
counted as a pass. Each domain now selects an explicit MySQL or fixture contract. Production defaults
to MySQL; local saved storage remains available only when explicitly selected. AUTH_SECRET aliases
the existing SESSION_SECRET and conflicting keys fail instead of silently invalidating imported MFA.

Readiness checks the live engine, exact migration names/checksums, physical schema, selected store,
storage and configured mail transport. The migration manifest is generated from immutable forward
SQL. Startup failure exits the process. Pool admission, query and transaction deadlines discard timed-out
sockets, and graceful shutdown drains admitted work while rejecting new work. Engine errors hide SQL
and parameters; MariaDB CHECK errno 4025 has an explicit portable mapping.

Public demo fixture generation and empty loopback QA seeding are explicit commands, separate from
merchant bootstrap. Fresh least-privilege import tests exposed an append-only ledger locking defect:
an INSERT IGNORE claim now serializes concurrent imports without granting UPDATE/DELETE. Legacy
queued bearer links can be sealed through a bounded audited tool without changing delivery metadata.
Both preserved merchant databases already contained sealed payloads (two inspected, zero changes).

Validation: **1,699/1,699** full application tests plus **3/3** subsequently added runtime-environment
checks; **1,434/1,434** real-engine database checks, zero pending. Typecheck, zero-warning lint and
production build pass. Four actual standalone startup drills exit with the expected failure for a
missing session key, refused database, unwritable storage and refused loopback SMTP. Fourteen native
pool/schema/shutdown failure cases pass across MySQL and MariaDB. A clean source checkout builds
with neither local environment files nor database credentials. Preserved data comparison is
**3,758 checks, zero differences on each engine**. Evidence is private under `.data/mysql-migration/`
(m8-unit-final.json, m8-runtime-env.json, m8-db-final.json, m8-startup-drills.json,
m8-clean-build.json and both m8 preservation reports).

M9 deployment packaging/private handoff and M10 complete production/performance acceptance remain.
No hosting account, remote database, deployment, real mail or payment was contacted.

## 2026-11-09 — M9 Hostinger packaging and private transfer

Pinned Node 24.x and pnpm 12.16.1, including pnpm's required package-manager lock metadata.
`pnpm build` now assembles standalone public/static assets and verifies artifact privacy. Startup
uses the host's one supervised process, PORT/HOSTNAME, and does not copy/delete assets. Runtime
order/payment return and OpenAPI links use SITE_URL. Docker uses Node 24; an optional private-env
VPS Compose profile and a manual-only Linux verification workflow are provided. Neither has been
executed remotely or on Docker during this Windows acceptance run.

An artifact scan found instrumentation tracing private QA snapshot temporaries despite route-only
excludes. Runtime filesystem boundaries now prevent that globbing, and the generated instrumentation
trace contains zero private paths. Packaging fails on private runtime directories, embedded actual
environment secrets or links outside the artifact. All 3,702 scanned artifact text files pass. Two
guard regressions cover secret redaction, private snapshots and external dependency junctions.

Added consistent streamed SQL backup/empty-database restore and referenced-upload backup tools.
Fresh-engine regressions cover binary UUIDs, non-ASCII/quoted text, dates, JSON, safe large integers,
generated guards, migration timestamps, checksum corruption, overwrite refusal and rollback. The
private handoff restores all **79 tables with equal row content** into fresh MySQL and MariaDB.
Both restored stores pass **3,758 original preservation checks with zero differences**. All
**44 originals and 528 prepared variants** verify. The private environment template retains the
existing Owner encryption/session key; no Owner reset, demo seed or merchant overwrite occurred.

Validation on official checksum-verified Node **24.22.2**: **1,704/1,704** application tests and
**1,436/1,436** native database tests, zero pending. Typecheck/lint and production build pass. An
independent temporary checkout installs **596 packages from the frozen lock**, builds without
local environment files/database credentials and produces a privacy-checked standalone release.
A relocated unpack (26 internal Windows dependency junctions rebased within the unpack, none to
source) boots on Node 24: readiness, homepage, **24 packaged script/style assets** and runtime
OpenAPI origin pass. Private evidence: m9-unit-final.json, m9-db-final.json, m9-isolated-build.json,
m9-unpacked-start.json, m9-unpacked-location.json and handoff restore-evidence.json.

The deployment runbook now covers owner Git import, private merchant transfer, all environment
keys, three migration paths, two-user grants and the weaker shared-account fallback, persistent
storage, SMTP, bounded cron/external scheduling, tested backups/restore, rollback and launch checks.
Hostinger account paths/privileges, Linux native runtime, deliverability and real devices remain
owner/manual checks. M10 full production regression and large-data/performance acceptance remain
before the authorized ready-release push. No hosting account/deployment/remote DB/real mail/payment
action occurred; the GitHub release has not been pushed yet.

### M10 — large-data performance and final QA (in progress, 2026-11-09)

Created separate least-privilege loopback performance datasets on both actual engines:
100,000 products, 300,000 variants and 500,000 orders. Budgets were fixed before tuning:
500 ms product listing/search, 300 ms order listing and 500 ms order search, measured with
three warmups and 20 samples. The committed runner verifies results and records actual EXPLAIN
plans; these are repository budgets, with browser/HTTP acceptance still separate.

Forward migrations 0014–0025 add covering indexes, transactional unique sizes and price heads,
store-scoped search terms, field-aware vocabulary, and order search documents/value/gram/link
projections. Product search aggregates matching indexed terms once, retains original weighting,
and caches only bounded committed-revision facets, scoped to database, store, query, collection
and ordered price lists. Stock and page rows remain live reads. Normalized order values use byte
grams followed by exact substring
verification. State/payment/refund changes, import, rollback and customer anonymisation retain
atomic projections; unused personal-data values and grams are erased together. Upgrade startup
requires the bounded 100-order JS backfill, which leaves order timestamps unchanged.

Native client socket deadlines now also install engine statement and lock-wait limits. Actual
process-list checks prove slow-query cleanup and safe subsequent reads. Backfill readiness,
Unicode/accents, literal wildcard/NUL search, formatted phones, price ties, duplicate sizes,
projection rollback, vocabulary edits/reindex/deletion and unused-PII erasure have regressions.

The application suite passes **1,721/1,721** and the complete native suite **1,463/1,463**, zero
pending. Both large gram indexes are seeded. The fixed repository matrix passes all 22 cases
across both engines: product listing/search p95 4.2–53.22 ms, order listing 26.23–73.16 ms and
order search 9.94–23.74 ms. Reports retain every sample, cold/warm plans and cold timings.
These results do not establish browser or HTTP acceptance.
Both preserved merchant database copies are upgraded to 0025 and pass 3,758-field preservation
verification with zero differences. The original local-store digest remains unchanged and
`.env.local` still explicitly selects the local driver. No Owner reset or hosting change occurred.

Sitemaps now use bounded 5,000-row metadata projections and robots.txt advertises large-entity
shards. Both-engine boundary, noindex/draft, image and isolation checks pass. The production build
and standalone privacy scan pass with these routes.

Unmasked comparison against the preserved production build found photo-only differences.
Immutable v2 variants retain the exact responsive widths and frozen q=75 encoder settings,
including four-thread AVIF tiling. All ten desktop reference screens now have **zero mismatched
pixels and equal heights**, including the three-item cart. Existing v1 objects remain untouched;
both merchant copies have the complete new variants. Other visual profiles remain to be run.

The production admin sweep exposed queue saturation from per-member role/code reads, the
Marketing role's product/report reads depending on unrelated permissions, and an invite duplicate
check depending on an authentication-only method. Bulk reads, dedicated product-stock/financial
projections and a secret-free invite check have shared fixture/native regressions. Financial reads
exclude PII in SQL and reports aggregate bounded batches. Long audit identifiers now wrap on
phones; auth/promotion actions wait for hydration. The full admin rerun is in progress.
Private sidebar/table/breadcrumb links now fetch on navigation instead of speculatively loading
other admin pages. The browser sweep exposed aborted background prefetches during navigation;
the full rerun checks this change without filtering console failures.

The next production HTTP matrix passes all 26 listing/search/order cases across both engines,
with three warmups and 20 measured requests per case. A no-result suggestion previously took
1.4–2.5 seconds: indexed length candidates, an equivalent banded OSA implementation and bounded
revision-scoped candidate caching reduce the measured cases to 13–370 ms. Full-vocabulary ordering,
Unicode and commit/rollback parity pass; exhaustive short-word comparisons retain the scorer.
All 100,000 product URLs are served once across twenty 5,000-URL shards on each engine, using the
runtime canonical origin. Root metadata, robots and product structured data also use that origin.

The mobile production profile now passes all seven routes without changing the budgets:
LCP 1,084–1,480 ms, CLS 0–0.04, INP 40–144 ms and initial script transfers 193,823–204,727 bytes.
The runner compares exact bytes and separately reports scripts loaded through interaction.
Admin initial scripts pass the 250 KiB limit at 246–248 KiB. Shared styles no longer pull interactive
components into every route; form schemas and optional header/sort panels load when needed.
Slow-code mouse/keyboard/hover checks pass in all three browsers. The header keeps a pressed
trigger until click completes and restores queued intent after panel handlers attach.
Document-only policies are omitted from normal JS/CSS transfers; documents, workers and unknown
clients retain full policies. Static responses vary by destination to keep those cache entries distinct.
The class-merger generator now retains used groups and runs before builds; its new production
artifact is in the complete browser/visual rerun. The previous exact-byte profile above predates
that final data reduction.

Known error identities now survive independently bundled API/RSC class constructors. The complete
public browser sweep is running on both engines with independent report/artifact directories.
It exposed a geometry harness reading a replaced sort node; it now waits for an actual measured
box and loaded fonts while retaining the exact equality assertion. A separate large-catalogue
audit found the inventory page hydrating the first 10,000 products before pagination; an isolated
request exceeded 30 seconds. That path still requires a bounded replacement and regression proof.

Still required: inventory correction, remaining load/recovery checks, two complete clean production
browser/visual/accessibility/performance passes per engine, refreshed private backup/restore
handoff and a clean verified release commit. The inherited design-export gate remains blocked
because the source has no Theme collection; generated theme/contrast checks pass. The ready-release
GitHub push remains pending; its remote main is still the owner's `b1cd1bf`. No deployment or remote
database action has occurred.


### M11 continuation ? inventory boundaries and cold interactions (2026-11-10)

Migration 0026 adds indexed generated stock availability. Staff inventory now delegates to an
inventory-scoped repository instead of hydrating the first 10,000 products. Native reads retain
exact JavaScript title ordering over narrow 5,000-row batches and hydrate only selected sizes;
the fixture adapter retains matching pagination and zero-stock fallback. Existing internal
500-row callers remain supported; the HTTP endpoint retains its 200-row limit. Boundary tests
cover 10,001 extra products, both ends of pagination, SKU matching and absent stock rows.

The application suite passed 1,723/1,723 before the additional inventory-only service regression;
that regression and the selection tests pass separately (11/11). Typecheck, lint, the production
build, standalone privacy packaging and 26-file portable migration lint pass. One complete native
run passed 1,468/1,469: a MariaDB inventory boundary request hit the unchanged query deadline while
browser QA was active. An isolated complete rerun is required; this is not accepted as a pass.
Large synthetic stock probes remain diagnostic at roughly 1.4 seconds on MariaDB and 2.2 seconds
on MySQL; no inventory latency acceptance is claimed.

The MySQL header/sort/geometry run passed 66/66. A MariaDB focused run passed 47/48 and exposed
Firefox replacing a pressed fallback between pointerup and click. The trigger now remains until
click or pointer cancellation; a controlled delayed-click regression covers this event gap.
Keyboard sorting waits for the selected option to receive focus before the next key, retaining
the actual navigation assertion. The new artifact still needs the complete rerun.

The MariaDB admin sweep passed 88/90: one banners permission page timed out at the database and
WebKit logged an aborted notification fetch during full-document navigation. Both remain open.
Earlier public sweeps passed 2,812/2,817 on MySQL and 2,814/2,817 on MariaDB, with no skips.
These are diagnostic runs, not clean release passes. Merchant source, Owner credentials and
the remote repository remain unchanged; final handoff, recovery/load checks and release push
are still pending.

The cold-control fix subsequently passed three consecutive runs per engine: 153/153 on each,
306 checks total, with no skips or retries. All 1,724 application tests passed before the new
cross-module context regressions. Further full admin sweeps remain diagnostic at 88/90;
remaining prefetches are now disabled consistently across admin links. Navigation audits wait
for header hydration before network-idle, and catalogue upload checks await the real 201 response
before checking the photo. Neither change filters console failures or raises a timeout.

A new real-engine regression reproduced a separate server-graph defect on both databases:
module-local transaction carriers did not recognize an outer transaction created by another
copy of the module, despite sharing one process-wide pool. Transaction/request/effect carriers,
RSC cache-function identity, session initializers and transaction-scoped staff admissions now
share the appropriate process lifetime while retaining per-request values. Tests cover nested
rollback, concurrent connections/identities, session initialization, self-revocation admissions
and commit/rollback invalidation. Complete suite and production reruns remain required.

The inventory boundary timeout also exposed a join-plan hazard: forcing only the availability
index can produce repeated scans per variant. Broad stock batches explicitly retain the indexed
level-first join order; selective scopes use normal optimizer choice. Removing the hint alone
passed the 192 parity checks but slowed the large MariaDB probe to 11.3 seconds; that diagnostic
is retained. The corrected broad plan measures about 1.3 seconds, with EXPLAIN retained.
Both preserved merchant copies are now on migration 0026 and still pass all 3,758 preservation
checks with zero differences. The original snapshot digest and all protected contracts match.

After the join-order and shared-context corrections, the complete native suite passes
1,473/1,473 and the complete application suite passes 1,728/1,728, with zero pending tests.
The new native cases verify cross-graph rollback and five concurrent initialized connections;
request tests verify twenty concurrent actors, nested scope restoration and failed requests.
Cross-graph self-revocation retains only the already admitted transaction; subsequent reads
remain unauthorized. Commit effects are discarded on rollback and deduplicated after commit.
The production artifact and full browser sweeps still require final verification.

The rebuilt production artifact and standalone privacy packaging pass. The refreshed private
migration-0026 handoff contains 87 tables, 44 originals and all 2,244 referenced storage objects.
Fresh restores on MySQL and MariaDB match every table fingerprint and all 3,758 merchant
preservation checks, with zero differences; all media checksums verify. This remains a private
candidate until final browser/load/visual acceptance and release publication are complete.

Production HTTP drills pass on both synthetic engines: eight simultaneous reads are observed
behind exactly five active app connections, then all complete with correct 500,000-order totals.
Actual engine shutdown during an in-flight request returns controlled 503/unavailable (22-37 ms);
new reads return 200 with the same totals after restart. The initial runner exposed a local
startup race by reopening data files before the old engine exited; failed reports are retained.
Waiting for the owned engine PID to exit resolves it without changing application deadlines.

The full MySQL admin sweep passes 90/90. MariaDB passes 89/90, with only Safari logging an
aborted notification read during full-document navigation. Readiness alone did not eliminate
that periodic-read cancellation. The small shared notification GET now completes across
navigation with keepalive, and its cache is scoped to staff identity and permissions. The
updated artifact still requires the console, complete browser and final performance reruns.

The final notification transport correction passes the three-browser module audit (3/3),
including Safari, without console filters. All 1,728 application tests pass on this artifact.
An independent source copy installs offline from the frozen lockfile and builds/packages
successfully on Node 24 without database credentials or a private environment. Fresh datasets
for the final first browser pass are prepared with new per-test identities and checksum-verified
copies of the exact frozen catalogue media. Complete clean passes, visual profiles and final
performance measurements remain to be run before marking the repo ready or pushing it.
