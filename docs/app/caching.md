# Caching

Rule: anything that depends on who is asking (bag, checkout, account, orders) is never cached. The
catalogue and content are cached briefly, and every money decision is re-made on the server at the
moment it matters (add to bag, quote, place order).

## Pages (from `next build`)

| Route | Mode | Freshness | Why |
| --- | --- | --- | --- |
| `/` | Static + ISR | 5 min (`revalidate = 300`) | New arrivals and drops change a few times a day. |
| `/shipping` | Static + ISR | 5 min | Shows the store's live delivery rates (D-056). |
| `/faq` | Static + ISR | 5 min | FAQs from the database, and the live delivery rate in one answer (D-066). |
| `/products/[slug]` | ISR on first visit (`generateStaticParams` → `[]`) | 60 s | Size availability may be up to a minute old. Adding to the bag re-checks stock, and `place_order` locks inventory rows, so a stale page can't oversell. |
| `/pages/[slug]` | ISR on first visit | 5 min | Policy text. |
| `/contact`, `/size-guide`, `/condition-guide`, `/terms`, `/privacy`, `/returns`, `/orders/lookup`, `/account/forgot-password` | Static | build | No per-request data. |
| `/sitemap.xml` | Static + ISR | 1 h | |
| `/collections/[slug]`, `/pre-loved`, `/search` | Dynamic | per request | Filters live in the query string (each combination is its own URL, `noindex` when filtered). |
| `/new-arrivals`, `/sale` | Dynamic | per request | The open tab and Load more count live in the query string (`?tab=preloved&show=24`); the canonical URL has neither. |
| `/cart`, `/checkout`, `/orders/[number]`, `/account/*`, `/newsletter/unsubscribe` | Dynamic, `private, no-store` | per request | Personal. |
| `/admin/*` | Dynamic, `private, no-store` | per request | Staff session and permissions; per-request nonce CSP. |

Missing products/pages answer a real **404**, and guest `/account` and empty-bag `/checkout` answer a
real **307**. There are no `loading.tsx` boundaries: a streamed fallback above a page
that 404s or redirects would commit status 200 first, and search must work without JavaScript (D-042). This is enforced by
`tests/unit/architecture.test.ts`.

## HTTP headers

- ISR pages: `s-maxage=<revalidate>, stale-while-revalidate`. A CDN can serve them; personal pages send
  `private, no-cache, no-store`.
- `/api/*`: `no-store` (from `next.config.ts`, plus `private, no-store` in `server/http/route.ts`).
  Headless `/api/v1/*` defaults to `no-store`.
- `/_next/static/*`: immutable, hashed file names (Next default).
- Images: `/_next/image` serves AVIF/WebP sized to the layout; the originals are in `public/images`.

## Data

- No application-level cache sits in front of the database. With `DATA_DRIVER=fixtures` the data is
  in-process memory, and with `supabase` every server render queries Postgres through the service
  role.
- Prices, promotions, shipping and tax are always computed fresh on the server (`server/pricing`,
  `server/promotions`, `server/shipping`). The client never sends a price.
- Exchange rates (`exchange_rates`) are display-only and carry `updated_at`; orders are charged in PKR.

## Invalidation

Admin catalogue, stock, collection and content writes call `refreshStorefront()`
(`server/shared/revalidate.ts`), which runs `revalidatePath('/', 'layout')` in a request (A-016).
This invalidates the storefront so its next request sees the change; the ISR windows remain the
fallback. Tests and jobs can call the same services outside a Next.js request.
