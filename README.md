# Sole Drop

Footwear storefront and staff admin built with Next.js, React and TypeScript. Read [AGENTS.md](AGENTS.md) before changing Next.js code; the installed version has its own documentation.

The normal local store is saved under `.data/store`, with private configuration in `.env.local`. A fresh clone starts without products. Catalogue and merchandising are managed through the admin; sample data and photos are reserved for isolated QA.

- `pnpm dev`: development server.
- `pnpm build`, then `pnpm start`: saved local preview at `http://127.0.0.1:3200`.
- `pnpm verify`: typecheck, lint, unit/integration/database tests and production build.
- `node qa/serve.mjs 3201`: isolated fixtures preview for browser regressions.

Run one server process per local data directory. Initial private Owner credentials for this migrated workspace are in ignored `.data/store/owner-bootstrap.json`; record them securely. New stores use `pnpm admin:create-owner` after configuring private secrets. Hosted deployments use the Supabase driver.

Open **Content → Banners & images** in the admin to edit homepage and page banners. See [catalogue and banner operations](docs/app/admin/catalogue-and-banners.md) for setup, migration, backups and QA commands, [deployment](docs/DEPLOYMENT-RUNBOOK.md) for hosted operation, and [verification](docs/app/admin/verification.md) for coverage and remaining limits.
