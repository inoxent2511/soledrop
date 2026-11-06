# Saved catalogue and banner operations

The normal local store uses `DATA_DRIVER=local`. Catalogue, content, commerce and staff records are saved under `LOCAL_DATA_DIR` (default `.data/store`). Restarting never restores sample products or replaces admin edits. Explicit `DATA_DRIVER=fixtures` remains an ephemeral QA mode; `DATA_DRIVER=supabase` remains the hosted database/Storage implementation.

## Where to change images

Open **Content → Banners & images** (`/admin/banners`).

| Placement | Editor |
| --- | --- |
| Main homepage slideshow | **Edit homepage banners** → Hero: upload/choose, replace, reorder, remove, edit alt text |
| Homepage category cards | Same editor → Category cards: image, title lines, destination and alt text |
| Homepage Instagram strip | Same editor → Instagram: photos, order, alt text, profile link and handle |
| Announcement, hero title, description and buttons | Same editor → Announcement & hero |
| New Arrivals, Pre-Loved, Sale, Men, Women, Kids and other collection pages | Select the collection in **Page & collection banners** → Banner image |
| Product page, cards, search and homepage featured drops | Products → product → Photos |

`/new-arrivals` and `/collections/new-arrivals` share the New Arrival collection image. `/sale` uses the Sale collection; `/pre-loved` uses Pre-Loved. Pages without a photographic banner do not acquire one through this editor. Condition-grade illustrations, icons, logos and designed policy documents remain explanatory/brand assets in code.

Homepage saves publish immediately and require `content:publish`. Collection banners require `collections:write`; uploads additionally require `media:write`. Readers see settings without editable controls. Concurrent homepage saves return 409 instead of overwriting a newer version.

Choose existing Media photos or upload JPEG, PNG, WebP or AVIF (10 MB maximum). Uploads are decoded, stripped of metadata and saved as WebP at a maximum 2400 px edge. Empty slideshow/category/Instagram lists hide those image sections. Media search and pagination reach the complete library. The Media details dialog shows usage; deletion is refused for photos referenced by any product status, a collection, the homepage or order history.

## Local migration performed

The live preview was exported into ignored `.data/migration-backup` before its process was stopped. The one-time import retained the live 20 products, their IDs/SKUs/prices/on-hand quantities, 8 collections, 7 existing uploads, and the existing order with payment/return history. Static product and merchandising photos were imported through the same image-processing pipeline as uploads. The resulting library contains 36 media records. The saved express-delivery flag was retained, and the audited stock adjustment was recovered into the ledger with explicit audit provenance; balances were not adjusted again. Old browser cart holds were released; checkout always revalidates availability.

The source of truth is now the saved store. Product/merchandising files moved out of `public` into `qa/fixtures/images` for isolated regressions. `supabase/seed.sql` now creates only operating configuration: an empty store, retail price list, PKR identity rate and disabled integration flags. The generated sample SQL lives at `qa/fixtures/seed.sql` (`pnpm db:seed` regenerates that QA file). No seed runs against the saved store on startup.

`pnpm admin:migrate-catalogue` imports the specific private preview export once and refuses an existing destination. It is a migration utility for this local preview, not a general database backup importer. It preserves exported entities; it does not transfer old demo staff sessions, browser carts, pending delivery jobs or unexported analytics. New stores never invoke it automatically.

## Starting and recovery

- `pnpm build`, then `pnpm start`: saved store at `http://127.0.0.1:3200`.
- Keep `.env.local` stable: its session secret seals MFA secrets and authenticates sessions. The migration created a private Owner and saved initial login, authenticator setup and recovery codes in ignored `.data/store/owner-bootstrap.json`. Demo logins are disabled in the saved store. Store those credentials securely and remove the bootstrap copy after recording them.
- For a new empty local store, configure private stable session/jobs secrets, then run `pnpm admin:create-owner --email you@example.com --site http://127.0.0.1:3200` while its server is stopped. It creates a one-use invite and refuses to bypass an existing Owner.
- Stop the server before an offline backup; copy the whole data directory, including media, and back up `.env.local` separately. Restore both together. Never replace the store with fixtures to recover an error.
- Local storage uses a versioned checksum, atomic file replacement, write rollback, one shared repository queue and an exclusive process lock. Staff catalogue/content/media operations hold that queue across their dependent writes. A corrupt snapshot fails closed. Dead-process locks can be recovered automatically; an ambiguous/empty lock requires inspection rather than deleting an active writer's lock.
- Local deletion removes media from the saved index and public serving. Unreferenced private file bytes are retained for recovery until an offline cleanup; a backup includes those files too.
- This local file driver supports one server process on one machine. Do not share it between replicas or put it on an ephemeral serverless filesystem. Hosted deployments use the existing Supabase path, the forward migrations and a private `media` Storage bucket. Hosted integration and real Postgres concurrency still need their separate verification.

`.data`, `.env.local`, credentials, migration exports and QA copies are ignored by Git and excluded from the Docker build context. No remote database or deployment was changed.

## Verification commands

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

`node qa/serve.mjs 3201` starts an isolated fixtures server with its own public files and caches. Use `QA_BASE_URL=http://127.0.0.1:3201 pnpm exec playwright test` for the full suite (set the environment variable in the shell's syntax).

Use a separate fixtures server on 3202 for `pnpm exec playwright test -c qa/banners.config.ts` with `QA_BASE_URL=http://127.0.0.1:3202`. The banner suite intentionally changes shared homepage content and checks all three browser engines, media pagination, permissions, stale saves, mobile widths and axe accessibility.

`node qa/local-persistence.mjs` copies the saved data into a private QA directory, then verifies admin writes, upload bytes, stock, prices, banners, existing orders and sessions through hard server restarts. It also checks renaming, unpublished/deleted products, in-use media protection and an empty catalogue. It never runs destructive checks against the user's store. Reports and generated copies remain local and ignored.
