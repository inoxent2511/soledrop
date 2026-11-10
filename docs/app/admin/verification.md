# Admin verification

Current migration evidence is maintained here and in [the build log](../build-log.md). The [deployment runbook](../../DEPLOYMENT-RUNBOOK.md) covers hosted acceptance and the private handoff. Historical PostgreSQL/PGlite and shared-demo measurements do not establish acceptance of this release.

## Automated evidence (2026-11-10)

| Check | Current result |
| --- | --- |
| Application suite | 1,728/1,728 passed, zero pending |
| Native MySQL/MariaDB suite | 1,473/1,473 passed, zero pending |
| Typecheck, lint, portable SQL and production package | Pass; 26 forward migrations |
| Independent clean install/build | Frozen offline install and production package pass on Node 24, without private environment/database credentials |
| Merchant restore | Both engines match all 87 table fingerprints and 3,758 preservation checks; 44 originals and all 2,244 storage objects verify |
| Frozen visual reference | 40/40 comparisons pass: ten screens at 1920/390 px, light/dark; zero measured mismatched pixels and equal heights, no masks or threshold relaxation |
| Cold menu/sort interactions | After the queued-publication fix, three consecutive runs per engine: 162/162 each across Chromium, Firefox and WebKit |
| Admin browsers | Diagnostic MySQL sweep passes 90/90; MariaDB passes 89/90 before the final notification fix. Its subsequent three-browser module audit passes 3/3. Complete fresh passes remain pending; a later public sweep was interrupted after exposing the queued-control race, which now has a deterministic regression. |
| Queue and recovery | Eight HTTP reads finish through five app connections on each engine. Actual engine shutdown returns 503/unavailable, followed by 200 reads with all 500,000 synthetic orders after restart. |

Native tests cover live stored permissions, store isolation, financial/PII projections, stock/reservations, refunds/returns, idempotency, concurrency, rollback/audit atomicity, generated columns, fresh installs and backups. Separately loaded server graphs share transaction/request carriers and session initialization while retaining concurrent identity isolation. Self-revocation is admitted only within its existing transaction.

Browser runs use isolated databases, per-test/per-role accounts and private report paths, exercising every browser without shared-demo TOTP skips. Ordinary shared-demo mode still skips duplicate scenarios to respect its account limits. Earlier failures remain recorded; targeted reruns are not counted as complete clean passes.

## Performance

The release runner checks exact initial script-transfer bytes, with a 200 KiB storefront budget and 250 KiB admin budget. It reports scripts loaded after interaction separately. Mobile runs use 390 px, 4x CPU slowdown, 150 ms RTT and 1.6 Mbps, with three runs per route; LCP/CLS/INP budgets remain 2,500 ms / 0.1 / 200 ms. Both engines pass all seven mobile routes: LCP 1,092-1,480 ms, CLS at most 0.04, INP at most 144 ms and exact initial scripts 191,920-202,824 bytes. All three measured admin routes pass 250 KiB at 245-247 KiB on both engines.

The fixed large-data matrix uses 100,000 products, 300,000 variants and 500,000 orders per engine, three warmups and twenty samples. Repository/HTTP listing and search budgets are in `db/tests/performance-budgets.json`; all 22 repository cases and all 26 production HTTP cases pass; actual samples and EXPLAIN plans are retained privately. HTTP p95 ranges from 27.98 to 414.41 ms on MySQL and 13.63 to 354.29 ms on MariaDB, each under its unchanged category budget. Each engine serves all 100,000 product URLs once across twenty sitemap shards with the runtime origin. Inventory probes remain diagnostic (about 1.3 seconds on MariaDB and 2.7 seconds on MySQL), rather than being relabelled as passing a new latency budget.

## Hosted and manual checks

- Confirm the actual Hostinger database version, account grants, proxy/HTTPS behavior, canonical domain and persistent storage across redeployment. Local restoration does not verify those account facts.
- Configure real SMTP and verify delivery, SPF/DKIM/DMARC and provider limits. Local QA uses a private file sink and sends no real mail or payment.
- Verify provider callbacks, real payment/refund handling, real devices, screen readers and the enrolled authenticator before opening customer traffic.
- The source design export lacks a Theme collection, so its export gate remains incomplete. Frozen-reference light/dark equivalence does not replace that source artifact. Admin remains in its existing light-theme design; a screenshot baseline for every admin screen/width/theme is not claimed.

Code publication and the owner GitHub import are pending until the remaining complete browser and performance passes finish. No remote deployment or database action has occurred.
