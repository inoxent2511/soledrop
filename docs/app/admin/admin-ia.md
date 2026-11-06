# Admin — information architecture

The back-office lives at `/admin` in the same Next.js app, with its own route group (`app/(admin)/admin/**`), layout and login. `features/admin/modules.ts` declares each business module's URL, label, group, icon, required permission and search keywords. The sidebar, command palette and no-access messages consume this registry. Dashboard widgets, entity-search queries and audit payloads live in their respective features and services.

## Navigation tree

| Group | Module | Route | Needs | Main tasks |
|---|---|---|---|---|
| — | Dashboard | `/admin` | `dashboard:read` | today's numbers, pending work, recent activity |
| Sales | Orders | `/admin/orders` | `orders:read` | find an order, fulfil, mark paid, refund, return, cancel, notes, packing slip, export |
| | Customers | `/admin/customers` | `customers:read` | look up a customer, their orders, addresses, consent; export / anonymise |
| Catalogue | Products | `/admin/products` | `products:read` | create and edit pairs, variants, prices, media, publish, import/export |
| | Collections | `/admin/collections` | `collections:read` | curate manual collections, build rule-based ones |
| | Inventory | `/admin/inventory` | `inventory:read` | stock levels, adjustments with reason, movement ledger, reservations |
| Marketing | Promotions | `/admin/promotions` | `promotions:read` | build and simulate promotions, generate codes, see redemptions |
| | Marketing | `/admin/marketing` | `marketing:read` | newsletter subscribers, abandoned carts |
| | Search | `/admin/search` | `search:read` | top and zero-result queries, synonyms |
| Content | Pages & FAQs | `/admin/content` | `content:read` | edit block pages and FAQs with preview, publish; link to code-managed policy pages (A-017) |
| | Banners & images | `/admin/banners` | `content:read` | homepage hero, announcement, category/Instagram photos and links to every collection banner editor |
| | Media | `/admin/media` | `media:read` | upload, alt text, usage |
| Money | Payments | `/admin/payments` | `payments:read` | provider status, bank-transfer queue, payments and refunds ledger |
| | Reports | `/admin/reports` | `reports:read` | sales, products, customers, promotions, refunds, inventory value |
| Setup | Shipping & tax | `/admin/shipping` | `shipping:read` | zones, rates, free-over thresholds, tax rates, rate tester |
| | Settings | `/admin/settings` | `settings:read` | store profile, feature flags, webhooks, API keys, jobs, outbox, health |
| | Staff & roles | `/admin/staff` | `staff:read` | invite, suspend, roles and permission matrix, sessions, MFA reset |
| | Audit log | `/admin/audit` | `audit:read` | who changed what, with before/after |

Global: ⌘K / Ctrl+K command palette (entities + actions the user may see), notification centre, account menu (profile, MFA, sessions, sign out). The admin is light-only (A-012); a `?` shortcuts sheet is not implemented.

## Roles → what they see

Preset roles and their permissions are defined in code (`server/admin/permissions.ts`); the full matrix is generated into [permissions.md](./permissions.md). Summary:

| Role | Lives in | Primary tasks |
|---|---|---|
| **Owner** | everything | everything; cannot be removed while they are the last active Owner |
| **Admin** | everything | runs the store day to day, manages staff |
| **Store Manager** | all modules but staff, roles, payment/API/webhook settings | orders, catalogue, promotions, content |
| **Catalogue Editor** | Products, Collections, Inventory, Media | keeps the catalogue right |
| **Content Editor** | Pages & FAQs, Media | policy pages, FAQs |
| **Marketing** | Promotions, Marketing, Search, Reports | campaigns, codes, newsletter |
| **Support Agent** | Orders, Customers | answer customers, small refunds (ceiling), cancel |
| **Fulfilment** | Orders (fulfil), Inventory | pack, ship, adjust stock |
| **Finance** | Orders, Payments, Reports | mark bank transfers paid, refunds, reconcile, export |
| **Read-only** | read access, no PII | look, never change |

## Out of scope (not applicable to this store yet)

- **Reviews & Q&A**: the storefront has no reviews; there is nothing to moderate. Listed in [admin-decisions.md](./admin-decisions.md).
- **Blog, banners, mega-menu editor**: the storefront has no blog or banner slots, and the header navigation is code-defined (`content/navigation.ts`). See the decisions file.
