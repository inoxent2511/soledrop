# Sole Drop migration release report

Release acceptance is in progress. Publication remains pending until two consecutive complete
production-build rounds pass on both engines. The interrupted workstation round is not counted.
This report will be updated with the final evidence and repository revision before handoff.

A previous complete round passed 5,940 browser checks, 80 frozen-reference comparisons,
1,728 application tests and 1,473 native tests, plus performance and HTTP recovery drills.
Later rounds exposed browser resource limits and a form hydration race, so that earlier pass
does not establish acceptance of the current source. The runner now uses bounded workers and
four sequential public shards. Forms wait for their own submission handlers; delayed-code
regressions pass 60/60 across both databases and all three browsers. Two fresh complete rounds
of the corrected source remain required.

## Stages and checkpoints

| Stage | Implementation checkpoint | State |
| --- | --- | --- |
| M0 inventory and protected baseline | `4460776` | Complete |
| M1 portable database foundation | `bd31dad` | Complete |
| M2 relational repositories and preserved import | `4831b77` | Complete |
| M3 transactions, replay and contention | `ff811fd` | Complete |
| M4 in-app authentication hardening | `3dedf19` | Complete |
| M5 actor authorization and request integration | `28ba3a9` | Complete |
| M6 storage, email, search, rate limits and jobs | `908e28b` | Complete |
| M7 atomic admin writes and provider refund recovery | `3683ecd` | Complete |
| M8 legacy removal and readiness | `032e32e` | Complete |
| M9 Hostinger artifact and private restore | `e4fddca` | Complete |
| M10 complete regression and performance loop | `3fb02c7`, `a2de210`, `d5500c6`, `c5c50dc` | Final acceptance running |

The initial inventory mapped all 13 domains, 154 existing repository capabilities and 52 former
SQL functions/helpers. Transactional operations and pure guards replace those helpers; the count
does not imply that every helper was a separate business transaction. No existing reviews,
wishlist, saved-view or version-history feature was found to migrate; these are recorded in the
inventory rather than invented for this backend change.

## Database and preservation

Local real engines are MySQL **8.0.46** and MariaDB **10.11.15**, using InnoDB, strict SQL,
utf8mb4 and UTC. The release has **26 forward migrations**, a checksummed advisory-lock ledger,
an operating/demo seed distinction and phpMyAdmin-compatible schema/grant bundles.

| Physical schema | MySQL | MariaDB |
| --- | --- | --- |
| Tables / primary keys | 87 / 87 | 87 / 87 |
| Indexes | 232 | 232 |
| Foreign keys | 109 | 109 |
| Additional unique constraints | 30 | 30 |
| CHECK constraints | 203 | 230 |

MariaDB's additional checks include its validated JSON representation. Generated availability
is recreated by the database; backup INSERTs omit generated columns. No trigger, privileged
routine or public database connection is required.

The private merchant handoff restores all **87 table fingerprints** and **3,758 preservation
checks per engine**, with zero differences. All **44 originals and 2,200 variants** verify by
checksum. IDs, catalogue, stock, orders, staff password hashes, enrolled MFA and the existing
session encryption key are retained. The original saved source remains an unchanged comparison
and recovery snapshot; new live SQL writes require current SQL/upload backups. GitHub contains
code and operational documentation; it does not contain the private SQL,
media transfer, credentials or account security data.

## Transactions, identity and authorization

Stock holds, checkout, counters, coupons, cart merges, state changes, payments, refunds, return
restocking and admin mutations use bounded transactions and consistent locks. Current locking
reads retain invariants after an earlier REPEATABLE READ snapshot. Replays retain the original
result. Refund intents reserve money/units before provider work; uncertain replies reconcile
with the stable provider key, without holding a database transaction across the network call.
Mandatory audit commits with the mutation; invalidation runs after commit.

Authentication retains the existing first-party realms and screens, using Node scrypt,
high-entropy opaque tokens stored as hashes, sealed MFA secrets and maintained **otplib 13**.
Better Auth was reviewed but its default token/assurance lifecycle did not meet this migration's
hash-at-rest and all-realm assurance contract without replacement. Customer and staff cookies
remain separate. Staff invitations, mandatory MFA, recovery codes, step-up, idle/absolute expiry,
revocation, lockout and one-use proofs have automated coverage. Optional OIDC, magic links and
verification are explicitly configured capabilities. The offline compromised-password list has
limited coverage; it is not a complete breached-password service.

Required actors, store/ownership predicates, PII projections and live stored permissions guard
repository access. The DAL guards each protected handler/page, with proxy redirects as an early
hint. Generated route-gate tests cover **1,484 combinations**; native tests also exercise actual
stored authorization, cross-store denial, stale identities and raw repository calls. Two local
database users prove app DDL and protected-history UPDATE/DELETE denial. A host exposing only
one DDL-capable user has a weaker database boundary, explicitly documented in the runbook.

Separately bundled server graphs share the pool's context carriers and initialization/admission
maps while retaining identity and transaction values per asynchronous request. Cross-graph
rollback, concurrent identities, deferred effects and self-revocation have regressions.

## Adapters and delivery

- Storage defaults to a private persistent local directory, with an S3-compatible reference
  adapter. Image reads serve prepared WebP/AVIF variants; encoding occurs on upload/backfill.
  Missing prepared v2 objects fail closed. Upload validation and reference-aware deletion remain.
- SMTP uses nodemailer and the durable, throttled outbox. File-sink mail is used for local QA.
  Fenced per-channel receipts avoid resending completed channels; SMTP acceptance before receipt
  commit remains an at-least-once boundary.
- Atomic database rate limits, indexed FULLTEXT/prefix/UTF-16 vocabulary search, transactional
  projections and bounded authenticated jobs replace the retired hosted services. External
  scheduler and search/storage reference adapters are documented configuration choices.
- The standalone artifact includes public/static assets and runtime traces, with private-file,
  embedded-secret and escaping-dependency guards. Node **24.x** and pnpm **12.16.1** are pinned.
  The independent clean checkout installs from the frozen lockfile and builds without private
  environment values. Linux native modules must be built on the deployment's platform.

The legacy backend dependencies, environment names, drivers and folders are removed. Architecture
checks preserve the retired SQL test intents. All twelve universal contracts are unchanged;
the orientation inventory found no vendor-specific lines requiring an exception in them.

## Validation status

The current application suite passes **1,729/1,729** and native suite **1,473/1,473**, with zero
pending cases. Each complete native round includes **10 races × 50 iterations × two engines**.
Failure coverage includes migrator locks/checksum refusal, physical schema drift, runtime
deadlines, storage errors, SMTP retry, duplicate/late jobs, webhook replay and backup restore.

Complete release rounds additionally require all public, commerce, admin and banner browsers;
accessibility, containment and interaction checks; frozen-reference comparisons; fixed mobile,
admin, repository and HTTP performance budgets; queued HTTP requests beyond the five-connection
pool; and actual engine shutdown/recovery during a request. Each current browser round requires
2,838 public, 36 commerce, 90 admin and 12 banner checks per database (5,952 total). Final counts
and measurements remain pending. Targeted reruns and interrupted rounds do not substitute for
these clean rounds.

Findings and root fixes are recorded in [the defect log](../qa/bugs.md); chronological evidence
is in [the build log](app/build-log.md). Test deadlines and budgets have not been raised to hide
failures. Pixel comparison uses the existing anti-alias exclusion, with zero allowed measured
pixel differences, equal heights and no masks.

## Blocked, unrun and owner checks

- **Blocked source-design gate:** the supplied design export lacks its Theme collection.
  Frozen production light/dark equivalence does not replace that missing source artifact. A
  baseline for every admin screen, width and theme is not claimed; admin retains its existing
  light-theme design.
- **Inherited GEO-01 remains unresolved against the source design:** the earlier desktop-nav
  audit measured text-box offsets up to 1.4 px and lacks a pre-menu geometry baseline. Frozen
  production parity preserves the current UI; it does not establish designer acceptance of
  those original source-box differences. No design approval or speculative layout change is claimed.
- **Hostinger not exercised:** confirm engine/version, Node entitlement/resources, connection
  caps, separate users/table grants, proxy/HTTPS, domain, Linux native modules, persistent storage
  across redeployment, cron, upload limits, logs and backup/restore controls.
- **External integrations not exercised:** real SMTP delivery and DNS authentication, real
  provider payments/refunds and hosted callbacks. Local tests use sinks/reference providers.
- **Manual checks not performed:** the owner's authenticator app, real mobile devices and
  screen readers. Playwright engine coverage is separate from real Safari/iOS/device evidence.

Use [the deployment runbook](DEPLOYMENT-RUNBOOK.md) and
[account checklist](app/hostinger-checklist.md) for import, environment, private transfer,
readiness, smoke checks and rollback. No remote database, hosting account, domain/DNS, real
email/payment or deployment has been touched. GitHub publication is authorized once the local
release checks are complete; it remains pending at the time of this draft.
