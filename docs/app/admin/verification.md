# Admin verification — A12/A13

Continuation date: 2026-11-06. This records the shipped core admin and the remaining requirements from the original brief. Earlier stage dates in `../build-log.md` are preserved as written.

## Checks

| Check | Result |
| --- | --- |
| `pnpm.cmd verify` | Passed on the final code: strict typecheck, ESLint with zero warnings, all 191 Vitest tests (23 files, including PGlite database tests), production build |
| `node scripts/generate-theme.mjs --check` | Passed: generated theme matches and declared contrast pairs pass |
| `node scripts/check-design.mjs --json` | Fails G3: the supplied Figma export has no Theme collection (P2-12); no source design was invented or changed |
| Full configured Playwright suite, two repetitions | Both passed on source commit `8777e34`: 2,868 passed / 48 existing skips / 0 failed per pass; no runner errors or reported flaky cases |
| Focused cross-browser regressions | 18/18 passed (CSP, populated bag/checkout, mini-cart); the intermittent WebKit sort-hover case also passed 20/20 repetitions |
| Gallery visual review | Reviewed production screenshots at 390 and 1440 px; sample dialogs/editors are included in the module smoke check and gallery is included in phone/desktop axe coverage |

Browser reports and screenshots are generated locally under `qa/out/a12-*` and are gitignored. The Windows sandbox prevented Firefox from launching; both full browser passes ran successfully outside it. `pnpm.cmd verify` passed before each pass, with a restarted fixtures server between passes.

| Pass | Chromium | Firefox | WebKit | Duration |
| --- | --- | --- | --- | --- |
| 1 | 972 passed | 948 passed, 24 skipped | 948 passed, 24 skipped | 17.7 min |
| 2 | 972 passed | 948 passed, 24 skipped | 948 passed, 24 skipped | 17.5 min |

Reports: local `qa/out/a12-full-pass1.json` and `qa/out/a12-full-pass2.json`. Together they contain 5,736 passing executions and 96 existing skipped executions, with zero unexpected results.

## Coverage and limits

- The permission-matrix suite checks all ten preset roles against 24 read APIs and 17 module pages. Architecture tests require a declared access check on every admin handler/page; integration tests cover selected write permissions, refund ceilings, PII masking and sensitive actions. This is not an exhaustive every-mutation × every-role test matrix.
- The admin permission matrix, accessibility sweeps and several module suites run in Chromium only and skip duplicate executions in the other projects, because they share TOTP-limited demo accounts. Core auth/CSP checks also run in Firefox and WebKit. The existing skips have not been removed or expanded to make a failing test pass.
- Database tests apply migrations and check RPCs/RLS in PGlite. Real Postgres parallel-connection contention, hosted Supabase and Storage integration remain unverified.
- Staff wrappers append their staff-context audit entry after the domain operation. Atomicity of that extra audit write together with the domain transaction has not been proven by these checks.
- Order and sales-report CSV exports currently check their export permission without step-up; customer/subscriber exports require step-up. The original broad export re-authentication requirement is therefore not fully implemented.
- The gallery was visually reviewed; a committed screenshot-baseline matrix for every admin screen at 390/768/1440 and every theme has not been produced. The admin currently uses the light theme (A-012).
- Real devices, screen readers, MFA with a real authenticator and provider email/payment delivery still require manual checks. No remote database, email, payment, push or deployment was used during this continuation.

## Performance

The A12 script-size check used a Read-only demo account on the production build and summed gzip-compressed response bodies for each page's `script[src]` files after document load. It excludes response headers and later interactions.

| Page | Compressed JavaScript |
| --- | ---: |
| `/admin` | 338.5 KiB |
| `/admin/orders` | 339.9 KiB |
| `/admin/products` | 339.9 KiB |
| `/admin/dev/gallery` | 343.2 KiB |

All four exceed the brief's 250 KiB budget (PERF-03). The 10,000-row interaction budget and list p95 on 100,000 products / 500,000 orders have not been measured. Existing storefront PERF-01/PERF-02, GEO-01 and pixel-QA findings remain in `qa/bugs.md` and `qa/defects.md`.

## Scope status

The core modules and recorded decisions A-001…A-020 are implemented. The original brief also requested capabilities beyond this core: advanced table controls/bulk workflows, automatic draft recovery and a shortcuts sheet, among others. The implemented shared components and UX gaps are described in `admin-design.md`; code-managed policies/integrations and absent storefront features are described in `admin-decisions.md`.

The original A12 requirement of two full passes with zero open findings has not been met while these performance, design and verification gaps remain. Passing automated regressions must be reported separately from that final sign-off.
