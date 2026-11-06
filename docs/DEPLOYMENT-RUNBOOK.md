# Deployment runbook

Phase 1 ships a deployable artefact; nothing has been deployed, linked or migrated remotely. Every
step below that touches a hosted service is for the owner (or someone they authorise) to run.

## 1. What gets deployed

| Piece | Source | Notes |
| --- | --- | --- |
| Web app | `Dockerfile` (Next.js `output: "standalone"`, Node 22, non-root, `HEALTHCHECK /api/health`) | Any container host. Listens on `PORT` (3000). Stateless: scale horizontally. |
| Database | `supabase/migrations/*.sql` (forward only) | Postgres 15+ with the Supabase `auth` schema (RLS helpers use `auth.uid()`). |
| Bootstrap | `supabase/seed.sql` | Empty store, retail price list, base-currency identity rate and disabled integration flags. Sample catalogue SQL and images live in `qa/fixtures` and are never production seeds. |
| Scheduled jobs | `POST /api/jobs/*` | Driven by any scheduler (§5). |

## 2. Environment

Copy `.env.example`; every key is documented there and validated at start-up (`lib/env.server.ts`,
`lib/env.ts`). A production server with an invalid environment prints one `{"level":"fatal"}` line
and exits with code 1 — check the container log first if it restarts in a loop.

Required in production: `NEXT_PUBLIC_SITE_URL` (build argument), `DATA_DRIVER=supabase`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` (≥ 32 random chars), `JOBS_SECRET`
(≥ 16), `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `EMAIL_FROM` (a verified sender).

Optional: `BANK_*` (bank transfer appears only when all three are set), `STRIPE_*` plus
`FEATURE_FLAGS=stripe-payments=on`, `API_KEYS`, `WEBHOOK_ENDPOINTS`, `TURNSTILE_*`.

`TRUSTED_PROXY_HOPS` (default 1) must equal the number of proxies in front of the container that
append to `X-Forwarded-For` (load balancer, CDN). Too high, and shoppers can forge their rate-limit
address; too low, and every shopper behind the proxy shares one limit. Leave `COOKIE_SECURE` unset.

For saved local operation and banner controls, see [catalogue and banners](app/admin/catalogue-and-banners.md). `DATA_DRIVER=local` is a single-process local preview; hosted deployments use Supabase and remain stateless.

After the first deploy, upload a photo and check `/_next/image?url=/media/<uploaded-id>.webp&w=828&q=75` returns
`image/avif` or `image/webp`. A JPEG of the original size means sharp's native libraries are missing
from the image (BUG-016, `e2e/images.spec.ts`).

`SUPABASE_SERVICE_ROLE_KEY` is read only by `server/db/supabase.ts` (enforced by
`tests/unit/architecture.test.ts`). Never give it a `NEXT_PUBLIC_` prefix.

## 3. First deployment

1. **Local proof** (no network): `pnpm install`, `pnpm verify` (typecheck, lint, tests, build), then
   `node qa/serve.mjs 3200` and open http://127.0.0.1:3200.
2. **Local Supabase** (needs Docker + Supabase CLI): `supabase start`, `supabase db reset` (migrations
   + seed), set `DATA_DRIVER=supabase`, `SUPABASE_URL=http://127.0.0.1:54321` and the printed
   service-role key, `pnpm dev`. Run `pnpm test:db` (it runs the same migrations in PGlite).
3. **Hosted project** (owner): create the project, then from a trusted machine
   `supabase link --project-ref <ref>` and `supabase db push`. Apply the minimal `supabase/seed.sql`
   bootstrap once for the configured store ID, then create the real catalogue and images through
   the admin or the scoped import API. Never apply `qa/fixtures/seed.sql` to a merchant database.
4. **First Owner** (admin, §8): create the `media` storage bucket, then make a one-time Owner invite
   and open its link to set a password and enrol two-step verification.
5. **Build and run**:
   `docker build -t soledrop --build-arg NEXT_PUBLIC_SITE_URL=https://<domain> .`
   `docker run -p 3000:3000 --env-file .env.production soledrop`
6. **TLS and domain** at the host/CDN. The app sends HSTS (2 years, preload): only serve it over HTTPS.
7. **Smoke**: `GET /api/health` → 200, `GET /api/ready` → 200 with `"driver":"supabase"`, place a COD
   order, cancel it, and confirm the stock returns.

## 4. Payments

- **COD**: always available; orders are `confirmed` and paid on delivery (record with
  `POST /api/v1/orders/{number}/payments`).
- **Bank transfer**: orders wait in `pending_payment`; staff record the transfer with the same
  endpoint, which moves the order to `confirmed`.
- **Stripe** (reference adapter, Checkout Sessions): set keys, enable the flag, and add the webhook
  endpoint `https://<domain>/api/webhooks/stripe` for `checkout.session.completed`
  and `checkout.session.expired`. Refunds are recorded through `POST /api/v1/orders/{number}/refunds`
  (the money itself is returned in the Stripe dashboard; see phase-2.md). Test-mode keys first.

## 5. Scheduled jobs

All are `POST` with `Authorization: Bearer $JOBS_SECRET`, idempotent and safe to overlap.

| Endpoint | Every | Does |
| --- | --- | --- |
| `/api/jobs/outbox` | 1 min | Delivers queued emails and signed webhooks (retries with back-off, 8 attempts). |
| `/api/jobs/release-reservations` | 5 min | Returns stock held by abandoned checkouts. |
| `/api/jobs/purge-carts` | daily | Deletes carts idle for 30 days. |

Example (any cron): `curl -fsS -X POST -H "Authorization: Bearer $JOBS_SECRET" https://<domain>/api/jobs/outbox`.

## 6. Operations

- **Logs**: one JSON line per server error (`instrumentation.ts`) with `digest`; shoppers see the same
  digest as "Reference" on the error page.
- **Health**: `/api/health` (process up, for the container) and `/api/ready` (database answers, for the
  load balancer; 503 otherwise).
- **Backups**: Supabase point-in-time recovery on the hosted plan; test a restore before launch.
- **Rotating secrets**: `SESSION_SECRET` rotation signs everyone out and invalidates order links in
  emails already sent; rotate `JOBS_SECRET` and `API_KEYS` freely (update the scheduler/clients).
- **Rollback**: redeploy the previous image. Migrations are forward-only, so a schema change that needs
  undoing is a new migration.
- **Data requests**: shoppers export (`/api/account/export`) and delete (`DELETE /api/account`, which
  anonymises their orders) themselves.

## 7. Never

Push a migration that disables RLS; edit an applied migration; run `seed.sql` on production; expose the
service-role key; point a development machine at the production database; set `ADMIN_DEMO_STAFF=on`
anywhere but a local fixtures build.

## 8. Admin

The back-office is at `/admin` (docs/app/admin/). Staff sign in with their own accounts (A-001), always
with two-step verification.

- **First Owner, local Supabase**: `pnpm admin:create-owner --email you@example.com` writes a one-time
  Owner invite (24 h) into the local database and prints `/admin/invite/<token>`. The script refuses any
  non-local `SUPABASE_URL`.
- **First Owner, hosted database**: in the Supabase SQL editor, insert the invite yourself (the token is
  any long random string you choose; only its SHA-256 is stored), then open
  `https://<domain>/admin/invite/<token>`:

  ```sql
  insert into staff_invites (store_id, email, role_key, token_hash, expires_at)
  values ('<STORE_ID>', 'you@example.com', 'owner', encode(sha256(convert_to('<token>', 'UTF8')), 'hex'), now() + interval '1 day');
  ```

  Everyone else is invited from Staff & roles.
- **Media**: create a private Storage bucket named `media`. Images are served by the app at
  `/media/<id>.webp`, never from the bucket directly.
- **Demo accounts** (`ADMIN_DEMO_STAFF=on`) exist only with the fixtures driver; the server refuses to
  start with them and `DATA_DRIVER=supabase`.
- **Locked out**: another Owner or Admin resets two-step verification or reactivates the account in
  Staff & roles. If the last Owner loses both their authenticator and their recovery codes, insert an
  invite for a new Owner address as above, then suspend the old account. The database never lets the
  store lose its last active Owner.
- **Sessions** end after 30 minutes idle and 12 hours in all. Rotating `SESSION_SECRET` also makes
  every staff member's stored TOTP secret unreadable, so everyone re-enrols (reset MFA for each):
  plan that rotation.
- **Audit log**: append-only; query `audit_log` directly if you need it outside the admin.
