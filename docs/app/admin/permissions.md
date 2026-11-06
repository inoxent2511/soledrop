# Admin — permissions

Generated from `server/admin/permissions.ts` (`pnpm admin:docs`); `tests/unit/admin-permissions.test.ts` fails when this file is out of date. ⚑ = sensitive: needs a fresh second factor (step-up, A-003).

## Role × permission

| Permission | Owner | Admin | Store Manager | Catalogue Editor | Content Editor | Marketing | Support Agent | Fulfilment | Finance | Read-only |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Dashboard** | | | | | | | | | | |
| `dashboard:read` — See the dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Orders** | | | | | | | | | | |
| `orders:read` — See orders | ✓ | ✓ | ✓ |  |  |  | ✓ | ✓ | ✓ | ✓ |
| `orders:write` — Edit orders (notes, address before fulfilment) | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `orders:fulfil` — Fulfil and ship orders | ✓ | ✓ | ✓ |  |  |  |  | ✓ |  |  |
| `orders:mark_paid` — Record payments (bank transfer, cash on delivery) | ✓ | ✓ | ✓ |  |  |  |  |  | ✓ |  |
| `orders:cancel` — Cancel orders | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `orders:refund` ⚑ — Refund orders (up to the role's limit) | ✓ | ✓ | ✓ |  |  |  | ✓ |  | ✓ |  |
| `orders:returns` — Receive returns and restock | ✓ | ✓ | ✓ |  |  |  | ✓ | ✓ |  |  |
| `orders:export` — Export orders | ✓ | ✓ | ✓ |  |  |  |  |  | ✓ |  |
| **Catalogue** | | | | | | | | | | |
| `products:read` — See products | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |
| `products:write` — Create and edit products | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `products:publish` — Publish and unpublish products | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `products:delete` ⚑ — Archive products | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `products:import` — Import products | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `products:export` — Export products | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `collections:read` — See collections | ✓ | ✓ | ✓ | ✓ |  | ✓ |  |  |  | ✓ |
| `collections:write` — Edit collections | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `inventory:read` — See stock | ✓ | ✓ | ✓ | ✓ |  |  | ✓ | ✓ |  | ✓ |
| `inventory:adjust` — Adjust stock | ✓ | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |
| `media:read` — See media | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |  | ✓ |
| `media:write` — Upload and edit media | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |
| **Customers** | | | | | | | | | | |
| `customers:read` — See customers (contact details masked) | ✓ | ✓ | ✓ |  |  | ✓ | ✓ |  | ✓ | ✓ |
| `customers:read_pii` — See customer email, phone and address | ✓ | ✓ | ✓ |  |  |  | ✓ |  | ✓ |  |
| `customers:write` — Edit customers | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |
| `customers:export` ⚑ — Export customer data | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `customers:delete` ⚑ — Anonymise customers | ✓ | ✓ |  |  |  |  |  |  |  |  |
| **Marketing** | | | | | | | | | | |
| `promotions:read` — See promotions | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  | ✓ |
| `promotions:write` — Create and edit promotions | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |
| `marketing:read` — See newsletter and abandoned carts | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  | ✓ |
| `marketing:export` ⚑ — Export subscribers | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |
| `search:read` — See search analytics | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  | ✓ |
| `search:write` — Edit search synonyms | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |
| **Content** | | | | | | | | | | |
| `content:read` — See pages and FAQs | ✓ | ✓ | ✓ |  | ✓ | ✓ |  |  |  | ✓ |
| `content:write` — Edit pages and FAQs | ✓ | ✓ | ✓ |  | ✓ |  |  |  |  |  |
| `content:publish` — Publish pages and FAQs | ✓ | ✓ | ✓ |  | ✓ |  |  |  |  |  |
| **Money** | | | | | | | | | | |
| `payments:read` — See payments and refunds | ✓ | ✓ | ✓ |  |  |  |  |  | ✓ | ✓ |
| `payments:reconcile` — Reconcile payments | ✓ | ✓ | ✓ |  |  |  |  |  | ✓ |  |
| `reports:read` — See reports | ✓ | ✓ | ✓ |  |  | ✓ |  |  | ✓ | ✓ |
| `reports:export` — Export reports | ✓ | ✓ | ✓ |  |  |  |  |  | ✓ |  |
| `pricing:read` — See price lists and exchange rates | ✓ | ✓ | ✓ | ✓ |  |  |  |  | ✓ | ✓ |
| `pricing:write` — Edit price lists and exchange rates | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| **Setup** | | | | | | | | | | |
| `shipping:read` — See shipping and tax | ✓ | ✓ | ✓ |  |  |  |  |  |  | ✓ |
| `shipping:write` — Edit shipping and tax | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `settings:read` — See settings | ✓ | ✓ | ✓ |  |  |  |  |  |  | ✓ |
| `settings:write` — Edit store settings | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `settings:flags` — Switch feature flags | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| `settings:payments` ⚑ — Change payment settings | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `settings:webhooks` ⚑ — Manage webhook endpoints | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `settings:api_keys` ⚑ — Manage API keys | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `jobs:run` — Run scheduled jobs | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| **Staff** | | | | | | | | | | |
| `staff:read` — See staff and roles | ✓ | ✓ | ✓ |  |  |  |  |  |  | ✓ |
| `staff:manage` ⚑ — Invite, suspend and reset staff | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `roles:manage` ⚑ — Create and edit roles | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `audit:read` — See the audit log | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |

## Refund ceiling per role

| Role | Highest single refund |
| --- | --- |
| Owner | no limit |
| Admin | no limit |
| Store Manager | Rs. 100,000 |
| Catalogue Editor | — |
| Content Editor | — |
| Marketing | — |
| Support Agent | Rs. 5,000 |
| Fulfilment | — |
| Finance | Rs. 500,000 |
| Read-only | — |

Custom roles are created in Staff & roles; they choose any permissions and their own ceiling. System roles cannot be deleted, and Owner cannot be edited.
