# Legacy test intent port

All sixty tests in the six retired database suites are mapped below before removing their old harness. Source commit: `3683ecd`; canonical source hashes are retained in `tests/fixtures/legacy-test-intents.json`. Existing application tests remain. The replacements run against actual MySQL/MariaDB, with fixtures as the behavioral reference where applicable. Repeated real-connection races supplement the old in-process interleavings.

Engine-specific security assertions change mechanism explicitly: browser/anonymous SQL accounts and executable RPCs are removed. Required actor types, guarded raw repositories, live session/grant matrices, ownership/store predicates and the runtime database account replace RLS/service-role checks. The backend runtime account has no DDL and cannot mutate append-only tables; the separate offline migrator remains privileged. There are no SQL routines, triggers or SECURITY DEFINER functions requiring search_path pinning. These are compensations for the deliberately removed RLS boundary, not a claim that MySQL supplies RLS.

Public homepage reads and aggregate trending remain public through the app; private tables and mutations have no browser database connection. Unknown-store operations require a matching store capability. Fuzzy merchant-history lookup now uses bounded native aggregates and the same service matcher, retaining the tested typo outcome without a database-specific operator. Production bootstrap remains empty; the explicit, marked QA fixture is restricted to isolated loopback test/QA databases and removed by the guarded db:reset command.

| ID | Original file/test | Replacement evidence |
| --- | --- | --- |
| L01 | `tests/db/admin.test.ts` — syncs the registry idempotently and keeps custom roles | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L02 | `tests/db/admin.test.ts` — resolves permissions through roles, and only for active members | [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts) |
| L03 | `tests/db/admin.test.ts` — lets staff:read see roles and keeps sessions server-only | [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts), [db/tests/auth-contract.test.ts](../../db/tests/auth-contract.test.ts) |
| L04 | `tests/db/admin.test.ts` — denies the admin RPCs to anon and authenticated | [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts), [tests/unit/actor-types.test.ts](../../tests/unit/actor-types.test.ts) |
| L05 | `tests/db/admin.test.ts` — refuses to leave the store without an active Owner | [db/tests/concurrency.test.ts](../../db/tests/concurrency.test.ts), [db/tests/commerce-contract.test.ts](../../db/tests/commerce-contract.test.ts) |
| L06 | `tests/db/admin.test.ts` — guards roles: unknown keys, Owner edits, system deletes, roles in use, stale writes | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L07 | `tests/db/admin.test.ts` — moves updated_at on every staff change | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L08 | `tests/db/admin.test.ts` — shows the audit log to audit:read holders of the same store | [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts) |
| L09 | `tests/db/admin.test.ts` — shows staff notes and orders to orders:read holders only | [db/tests/commerce-contract.test.ts](../../db/tests/commerce-contract.test.ts), [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts) |
| L10 | `tests/db/admin.test.ts` — saves products atomically: stale saves, taken slugs and removing ordered sizes are refused | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts), [db/tests/catalogue-contract.test.ts](../../db/tests/catalogue-contract.test.ts) |
| L11 | `tests/db/admin.test.ts` — gives the anon role nothing from any admin table, and staff nothing from sessions | [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts), [tests/unit/actor-types.test.ts](../../tests/unit/actor-types.test.ts), [db/tests/auth-contract.test.ts](../../db/tests/auth-contract.test.ts) |
| L12 | `tests/db/home-content.test.ts` — bootstraps no sample products or promotions, with a usable base price list | [db/tests/seed.test.ts](../../db/tests/seed.test.ts) |
| L13 | `tests/db/home-content.test.ts` — saves through service_role and rejects stale or simultaneous first saves | [db/tests/catalogue-contract.test.ts](../../db/tests/catalogue-contract.test.ts), [db/tests/admin-atomic.test.ts](../../db/tests/admin-atomic.test.ts) |
| L14 | `tests/db/home-content.test.ts` — blocks anonymous direct reads and writes | [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts), [tests/unit/actor-types.test.ts](../../tests/unit/actor-types.test.ts) |
| L15 | `tests/db/home-content.test.ts` — finds purchased image usage only within the owning store | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L16 | `tests/db/rls.test.ts` — is enabled on every table in public | [tests/unit/actor-types.test.ts](../../tests/unit/actor-types.test.ts), [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts) |
| L17 | `tests/db/rls.test.ts` — lets shoppers read only the published catalogue and content | [db/tests/catalogue-contract.test.ts](../../db/tests/catalogue-contract.test.ts) |
| L18 | `tests/db/rls.test.ts` — denies anonymous access to everything private | [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts), [db/tests/commerce-contract.test.ts](../../db/tests/commerce-contract.test.ts) |
| L19 | `tests/db/rls.test.ts` — denies the RPCs to anon and authenticated | [tests/unit/actor-types.test.ts](../../tests/unit/actor-types.test.ts), [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts), [db/tests/foundation.test.ts](../../db/tests/foundation.test.ts) |
| L20 | `tests/db/rls.test.ts` — gives a signed-in user with no staff role nothing beyond the storefront | [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts), [tests/unit/actor-types.test.ts](../../tests/unit/actor-types.test.ts) |
| L21 | `tests/db/rls.test.ts` — scopes staff by role | [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts) |
| L22 | `tests/db/rls.test.ts` — keeps the audit log append-only, even for the service role | [db/tests/foundation.test.ts](../../db/tests/foundation.test.ts) |
| L23 | `tests/db/rls.test.ts` — pins search_path on every function and keeps SECURITY DEFINER to the role and permission lookups | [db/tests/foundation.test.ts](../../db/tests/foundation.test.ts), [tests/unit/mysql-boundary.test.ts](../../tests/unit/mysql-boundary.test.ts) |
| L24 | `tests/db/rpc.test.ts` — hands out gap-free unique numbers under contention | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L25 | `tests/db/rpc.test.ts` — rejects an unknown store | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L26 | `tests/db/rpc.test.ts` — releases one cart's holds idempotently with an empty replacement, preserving another cart's stock | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L27 | `tests/db/rpc.test.ts` — never holds more than is on hand when carts race for the last units | [db/tests/concurrency.test.ts](../../db/tests/concurrency.test.ts), [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L28 | `tests/db/rpc.test.ts` — replaces a cart's own holds instead of stacking them | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L29 | `tests/db/rpc.test.ts` — is all or nothing across lines | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L30 | `tests/db/rpc.test.ts` — reports availability with the cart's own holds counted as free for that cart | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L31 | `tests/db/rpc.test.ts` — returns expired holds exactly once when run concurrently | [db/tests/concurrency.test.ts](../../db/tests/concurrency.test.ts), [db/tests/commerce-contract.test.ts](../../db/tests/commerce-contract.test.ts) |
| L32 | `tests/db/rpc.test.ts` — sells the last pair exactly once when many shoppers check out at once | [db/tests/concurrency.test.ts](../../db/tests/concurrency.test.ts) |
| L33 | `tests/db/rpc.test.ts` — replays a repeated idempotency key instead of charging twice | [db/tests/concurrency.test.ts](../../db/tests/concurrency.test.ts), [db/tests/commerce-contract.test.ts](../../db/tests/commerce-contract.test.ts) |
| L34 | `tests/db/rpc.test.ts` — converts the cart, uses the cart's own holds, numbers the order and queues the event | [db/tests/commerce-contract.test.ts](../../db/tests/commerce-contract.test.ts) |
| L35 | `tests/db/rpc.test.ts` — does not sell stock another cart is holding | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts), [db/tests/concurrency.test.ts](../../db/tests/concurrency.test.ts) |
| L36 | `tests/db/rpc.test.ts` — rolls everything back when a promotion fails | [db/tests/concurrency.test.ts](../../db/tests/concurrency.test.ts), [db/tests/commerce-contract.test.ts](../../db/tests/commerce-contract.test.ts) |
| L37 | `tests/db/rpc.test.ts` — never exceeds a usage limit under contention | [db/tests/concurrency.test.ts](../../db/tests/concurrency.test.ts) |
| L38 | `tests/db/rpc.test.ts` — enforces once per shopper by email, case-insensitively | [db/tests/concurrency.test.ts](../../db/tests/concurrency.test.ts) |
| L39 | `tests/db/rpc.test.ts` — merges a guest bag once, capped by stock and 10 per line | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L40 | `tests/db/rpc.test.ts` — lets exactly one of two racing transitions win and restocks a cancellation once | [db/tests/concurrency.test.ts](../../db/tests/concurrency.test.ts), [db/tests/commerce-contract.test.ts](../../db/tests/commerce-contract.test.ts) |
| L41 | `tests/db/rpc.test.ts` — walks the happy path and refuses to skip a step | [db/tests/commerce-contract.test.ts](../../db/tests/commerce-contract.test.ts) |
| L42 | `tests/db/rpc.test.ts` — records a replayed webhook once and confirms a pending order when paid in full | [db/tests/commerce-contract.test.ts](../../db/tests/commerce-contract.test.ts) |
| L43 | `tests/db/rpc.test.ts` — never refunds more than was paid, even with concurrent requests | [db/tests/concurrency.test.ts](../../db/tests/concurrency.test.ts), [db/tests/commerce-contract.test.ts](../../db/tests/commerce-contract.test.ts) |
| L44 | `tests/db/rpc.test.ts` — restocks a received return exactly once | [db/tests/commerce-contract.test.ts](../../db/tests/commerce-contract.test.ts) |
| L45 | `tests/db/rpc.test.ts` — never lets on-hand go negative or below what is held | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts), [db/tests/foundation.test.ts](../../db/tests/foundation.test.ts) |
| L46 | `tests/db/rpc.test.ts` — claims each outbox event for one worker only | [db/tests/commerce-contract.test.ts](../../db/tests/commerce-contract.test.ts) |
| L47 | `tests/db/rpc.test.ts` — counts rate-limit hits in a fixed window | [db/tests/commerce-contract.test.ts](../../db/tests/commerce-contract.test.ts) |
| L48 | `tests/db/rpc.test.ts` — subscribes an address once | [db/tests/catalogue-contract.test.ts](../../db/tests/catalogue-contract.test.ts) |
| L49 | `tests/db/rpc.test.ts` — keeps exactly one default address | [db/tests/commerce-contract.test.ts](../../db/tests/commerce-contract.test.ts) |
| L50 | `tests/db/rpc.test.ts` — upserts by slug and is idempotent | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L51 | `tests/db/search.test.ts` — let shoppers read synonyms but never change them | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts), [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts) |
| L52 | `tests/db/search.test.ts` — let owners manage synonyms and keep support staff read-only | [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts) |
| L53 | `tests/db/search.test.ts` — hide the search log from shoppers and support staff, and show it to owners | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts), [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts) |
| L54 | `tests/db/search.test.ts` — reject a log row that is both a search and a click, or neither | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L55 | `tests/db/search.test.ts` — counts recent searches that found something, not clicks, zero-result or old searches | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L56 | `tests/db/search.test.ts` — clamps the limit and window | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L57 | `tests/db/search.test.ts` — is callable by the service role only | [db/tests/foundation.test.ts](../../db/tests/foundation.test.ts), [tests/unit/actor-types.test.ts](../../tests/unit/actor-types.test.ts), [db/tests/live-authorization.test.ts](../../db/tests/live-authorization.test.ts) |
| L58 | `tests/db/search.test.ts` — can use the trigram index for fuzzy merchant reports | [db/tests/legacy-contract.test.ts](../../db/tests/legacy-contract.test.ts) |
| L59 | `tests/db/seed.test.ts` — is generated from the fixtures and up to date | [db/tests/seed.test.ts](../../db/tests/seed.test.ts) |
| L60 | `tests/db/seed.test.ts` — loads into the migrated schema with every row the fixtures driver serves | [db/tests/seed.test.ts](../../db/tests/seed.test.ts) |
