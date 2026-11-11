# Sole Drop

Footwear storefront and staff admin built with Next.js, React and TypeScript. The hosted runtime uses MySQL/MariaDB through the Next.js backend. Catalogue, prices, stock, orders, staff and merchandising are managed in the database.

Use Node **24.x** and pnpm **12.16.1**. Read [AGENTS.md](AGENTS.md) before changing Next.js code; the installed version has its own guides.

- Install: `pnpm install --frozen-lockfile`.
- Configure private runtime values using `.env.example` and the [deployment runbook](docs/DEPLOYMENT-RUNBOOK.md).
- Build and package: `pnpm build`.
- Start: `pnpm start` (host-supplied `PORT`, default 3000).
- Application checks: `pnpm verify`.
- Native database checks: `pnpm db:test`; local engine/test setup is in [db/README.md](db/README.md).

For Hostinger, import the code repository as a Node.js Web App and use `pnpm build:hostinger` and
`pnpm start:hostinger`. This selects the Webpack build required by Hostinger's current glibc
environment. Transfer the private SQL/media handoff separately. GitHub does not contain merchant
data, uploads or credentials. Preserve the existing session key, Owner password and enrolled
authenticator when importing this store; do not seed over it or create a replacement Owner.

The [migration report](docs/MIGRATION-REPORT.md) records implementation checkpoints, validation status and the checks that require the actual hosting account.

Open **Content > Banners & images** (`/admin/banners`) to change homepage and collection banners. Product photos are managed through Products. See [catalogue and banner operations](docs/app/admin/catalogue-and-banners.md), [security](docs/app/admin/security.md) and [verification](docs/app/admin/verification.md).

The file-backed `local` driver remains available for the preserved offline comparison snapshot. `fixtures` and demo photos are reserved for isolated QA. Production selects `DATA_DRIVER=mysql` and needs configured database, persistent storage and email settings. After cutover, backups and compatible-artifact rollback use the live SQL database and persistent uploads.
