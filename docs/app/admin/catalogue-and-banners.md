# Catalogue and banner operations

The hosted release uses `DATA_DRIVER=mysql` with MySQL/MariaDB. Products, content, commerce and staff records come from the database. The preserved `local` file store is an offline source/rollback copy; `fixtures` is ephemeral QA. Startup never restores demo products over merchant edits.

Follow the [deployment runbook](../../DEPLOYMENT-RUNBOOK.md) for schema import, private data, persistent media and runtime configuration.

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

## SQL migration and recovery

The current private handoff preserves 20 products, 44 media originals, their 2,244 prepared storage objects, staff credentials/MFA, sessions and order history. Its schema contains 87 tables through migration 0026. Fresh restores on MySQL and MariaDB match every table and all 3,758 merchant preservation checks. These are local restore results; hosted acceptance remains an owner step.

- Import the matching schema and private merchant SQL into a new empty database. Do not run demo seeds or bootstrap a replacement Owner.
- Preserve `SESSION_SECRET` exactly; it opens enrolled MFA secrets and protected delivery links. Keep database credentials and handoff files out of Git.
- Copy media to the configured persistent storage directory outside changing build releases. Originals and prepared variants retain immutable keys.
- Use the release backup/restore tools and upload checksum manifest. Migration 0026 adds generated availability; backups omit generated columns and retain their source stock quantities.
- Stop merchant writes for the final transfer snapshot. Keep the previous database/files and private configuration until the hosted smoke checks pass.

`pnpm db:seed` is minimal configuration for a genuinely new store. Demo fixture commands are restricted to named local test databases. Neither is an import step for this merchant store.

## File-backed rollback copy

`DATA_DRIVER=local` saves under `LOCAL_DATA_DIR` (default `.data/store`) and allows one process per directory. Stop its server before copying the whole directory and private environment. Restore both together; never replace it with fixtures to recover an error. Checksums, atomic replacement and an exclusive process lock protect saved state. Ambiguous locks require inspection.

The local catalogue import utility remains available for its specific private preview export; it is not a general SQL backup importer. New SQL stores use the runbook bootstrap procedure, while imported stores retain their existing Owner.

## Verification

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm db:lint`, `pnpm db:test` and `pnpm build` with the guarded local test setup. The [verification record](./verification.md) distinguishes automated evidence from hosted/manual checks. Isolated browser QA uses separate stores and per-test staff accounts; it never resets the merchant Owner.

## Historical local import

The following records the earlier file-store import, before the SQL migration and later media additions:

The live preview was exported into ignored `.data/migration-backup` before its process was stopped. The one-time import retained the live 20 products, their IDs/SKUs/prices/on-hand quantities, 8 collections, 7 existing uploads, and the existing order with payment/return history. Static product and merchandising photos were imported through the same image-processing pipeline as uploads. The resulting library contains 36 media records. The saved express-delivery flag was retained, and the audited stock adjustment was recovered into the ledger with explicit audit provenance; balances were not adjusted again. Old browser cart holds were released; checkout always revalidates availability.
