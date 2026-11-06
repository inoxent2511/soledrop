# Caching

Storefront layouts now use `dynamic = "force-dynamic"`: admin-managed catalogue, banners and content are read per request, including pages that previously used ISR. This also keeps build workers from opening a saved local store. Every money decision is still re-made on the server when adding to the bag, quoting and placing an order.

## Pages (from `next build`)

| Route | Mode | Freshness | Why |
| --- | --- | --- | --- |
| `/` | Dynamic | per request | Saved homepage content and active products. |
| `/shipping`, `/faq` | Dynamic | per request | Live rates and FAQs. |
| `/products/[slug]` | Dynamic | per request | Current product status, photos, prices and availability. Checkout revalidates stock. |
| `/pages/[slug]` | Dynamic | per request | Current published content. |
| `/contact`, `/size-guide`, `/condition-guide`, `/terms`, `/privacy`, `/returns`, `/orders/lookup`, `/account/forgot-password` | Dynamic | per request | Shared layout reads live navigation/store data. |
| `/sitemap.xml` | Dynamic | per request | Published products, collections and pages. |
| `/collections/[slug]`, `/pre-loved`, `/search` | Dynamic | per request | Filters live in the query string (each combination is its own URL, `noindex` when filtered). |
| `/new-arrivals`, `/sale` | Dynamic | per request | The open tab and Load more count live in the query string (`?tab=preloved&show=24`); the canonical URL has neither. |
| `/cart`, `/checkout`, `/orders/[number]`, `/account/*`, `/newsletter/unsubscribe` | Dynamic, `private, no-store` | per request | Personal. |
| `/admin/*` | Dynamic, `private, no-store` | per request | Staff session and permissions; per-request nonce CSP. |

Missing products/pages answer a real **404**, and guest `/account` and empty-bag `/checkout` answer a
real **307**. There are no `loading.tsx` boundaries: a streamed fallback above a page
that 404s or redirects would commit status 200 first, and search must work without JavaScript (D-042). This is enforced by
`tests/unit/architecture.test.ts`.

## HTTP headers

- Dynamic pages send private/no-store headers; no CDN page cache is assumed.
- `/api/*`: `no-store` (from `next.config.ts`, plus `private, no-store` in `server/http/route.ts`).
  Headless `/api/v1/*` defaults to `no-store`.
- `/_next/static/*`: immutable, hashed file names (Next default).
- Images: `/_next/image` serves AVIF/WebP sized to the layout. Product/banner originals are immutable `/media/{id}.webp` files; a replacement gets a new ID. Explanatory and brand assets remain in `public/images`; sample product/merchandising assets exist only in the isolated QA preview.

## Data

- No application-level cache sits in front of the database. `DATA_DRIVER=local` reads the saved local store through a serialized repository queue; `fixtures` is in-process QA data; `supabase` queries Postgres through the server's service role.
- Prices, promotions, shipping and tax are always computed fresh on the server (`server/pricing`,
  `server/promotions`, `server/shipping`). The client never sends a price.
- Exchange rates (`exchange_rates`) are display-only and carry `updated_at`; orders are charged in PKR.

## Invalidation

Admin catalogue, stock, collection and content writes call `refreshStorefront()`
(`server/shared/revalidate.ts`), which runs `revalidatePath('/', 'layout')` in a request (A-016).
This invalidates relevant client navigation caches; dynamic server requests already read current data. Tests and jobs can call the same services outside a Next.js request. Dynamic rendering trades the previous ISR cache for immediate admin freshness; hosted performance remains a separate verification item.
