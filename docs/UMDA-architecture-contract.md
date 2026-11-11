# 🏗️ Universal Modular-Domain Architecture (UMDA) Protocol — Next.js Web Edition

**Role:** You are an expert Principal Software Architect maintaining a Next.js (App Router) web application. Your goal is to extend the system without introducing redundant logic, breaking state isolation, or diverging from the layering already established by the project's reference feature (the first feature built — it is named in `docs/app/` and mapped in [PROJECT-STRUCTURE.md](./PROJECT-STRUCTURE.md)).

**Don't add layers this app doesn't need.** The reference feature — route → feature component → feature hook → query hook → api file → route handler — already proves this structure out end to end. No `domains/` folder, no dependency-injection container, no repository abstraction on top of the query hooks. If a future feature seems to need more structure than this, that's a sign to re-read how the reference feature solved it, not to introduce a new layer "for scale."

## 1. Architectural Philosophy: The Layers

Separation of concerns is layered by **folder role**, not by a domains/features split. Requests flow top to bottom:

0. **`app/api/[domain]/route.ts`** *(only when the app has a backend or a third-party API)* — the BFF (backend-for-frontend). Thin Route Handlers: verify the session, validate input with the feature's Zod schema, call the upstream service with server-held secrets, return a trimmed DTO. No business logic that a feature hook would own.
1. **`api/[domain].ts`** — Network layer. Raw typed request functions only (browser → `/api/...`, or server → upstream). Written mock-first with a header comment mapping each exported function to the real endpoint it becomes, so it is **the single file to swap** when the real backend lands. Never called directly from components or feature hooks.
2. **`hooks/api/[domain]/`** — Server state. Two kinds of file, one per action:
   - `queries.ts` — `queryOptions` factories (keys + `queryFn` wrapping exactly one `api/` function). **No `"use client"`, no React hooks** so Server Components can import them to prefetch.
   - `use[Action].ts` — one TanStack Query `useQuery`/`useMutation` hook per action, consuming the factory. Side effects that must update app-wide state (e.g. `useLogin`'s `onSuccess` calling a context setter or invalidating a key) belong here, not in the component.
3. **`context/[Name]Context.tsx`** — App-wide singleton client state (see [state-management-contract.md](./state-management-contract.md)). Owns state machines and persistence lifecycles, or trivial cross-tree UI flags. Exposes exactly one `use[Name]()` hook that throws outside its Provider.
4. **`features/[feature]/`** — The feature module. Feature hooks are allowed to orchestrate (call mutation hooks, read/write context, navigate, hold local UI state) — that orchestration is intentionally colocated with the feature it belongs to, not extracted into a separate domain layer, because this app has one feature per real business capability, not many features sharing one domain.
   - `components/` — presentation: layout, composing `components/ui` + `components/shared`, `<Controller>` wiring, inline error rendering. No direct API/storage calls — only the hooks it is given.
   - `hooks/` — `use-[x]-form.ts` and other orchestration: owns `useForm`, calls `hooks/api/[domain]` hooks, reads/writes `context/`, triggers navigation, holds local UI-only state (`serverError`, `showPassword`, countdowns).
   - `schemas/` — Zod schemas + inferred types (see form contract). The **same schema file** is imported by the route handler that validates the request on the server.
   - `types/` — payload/domain types shared by `api/`, `hooks/api/`, route handlers and the feature itself.
5. **`app/`** — Next.js routes only. A `page.tsx` imports a `features/[feature]/components/*` and renders it inside route chrome (metadata, `loading.tsx`, `error.tsx`). It must not contain form logic, `fetch` calls, Zod schemas, `useState` or `useEffect`.

Shared building blocks sit beside the layers: `components/ui/` (design-system primitives), `components/shared/` (app chrome used by several features), `content/` (bundled data, pure), `lib/` (utils, env, query client, server-only auth helpers).

**When adding a second feature that shares logic with an existing one** (e.g. `profile` also needs the user object that `auth` owns): pull the shared piece into `context/`, `hooks/` or `lib/` — do not reach across from `features/profile` into `features/auth` internals.

## 2. The Server/Client Boundary (Next.js specific)

i. **Routes are Server Components.** `page.tsx`, `layout.tsx`, `template.tsx`, `loading.tsx` and `not-found.tsx` never carry `"use client"`. The one required exception is `error.tsx` / `global-error.tsx` (Next.js demands a Client Component): keep each a few lines that render a shared error view.
ii. **`"use client"` goes on the smallest leaf** that needs it — a `features/*/components/*` file using state, effects, event handlers or browser APIs; a `components/ui/*` primitive that needs hooks; a Provider. Never on `api/`, `lib/`, `content/`, schemas, types or `hooks/api/*/queries.ts`.
iii. **Server-only modules** (anything reading secrets, cookies or the session: `lib/env.server.ts`, `lib/auth/*`) start with `import 'server-only'` so a client import fails the build.
iv. **Props crossing into a Client Component are serialisable data** (DTOs), not class instances, Dates-as-objects you rely on, or functions (Server Actions excepted).
v. **A Server Component must not import a non-component export from a `"use client"` file** — it arrives as a client reference, not the function. That is why query factories live in a directive-free `queries.ts`.

## 3. State & Data Isolation Protocol

**STRICT RULE:** Presentation components (`features/*/components/`, `components/*`, `app/`) must never directly call `fetch`, read/write `localStorage`/`sessionStorage`/`document.cookie`, or touch `window`/`document` for data.

i. **Encapsulated State Access:** All network calls go through `hooks/api/[domain]/`; all persisted/global client state goes through a `context/` hook (`useSettings()`, `useCart()`…).
ii. **Reactivity First:** UI updates come from React state (context, TanStack Query, `useForm`) — never manual polling. Browser event subscriptions (resize, `matchMedia`, online/offline) live in one shared hook with cleanup (`useSyncExternalStore` where it fits), not inline in components.
iii. **Zero Storage Leaks:** Only the persisted-state context (and the single storage module it owns) may call `localStorage`. Everything else consumes it through the hook. Session cookies are created, read and deleted **on the server only** (`httpOnly`). `next-themes` is the one sanctioned library that owns its own theme storage.

## 4. Data & API Layer — BFF by Default

i. **BFF proxy:** Browser calls go to this app's own `app/api/[domain]/route.ts`, which talks to the upstream service. This keeps secrets off the client, avoids CORS, translates auth, shapes responses into DTOs and gives one place for rate limiting and bot checks.
ii. **Direct-to-upstream exception:** only for public, CORS-enabled endpoints that use a public, origin-scoped key (a map tile service, a public search index). Say so in the `api/[domain].ts` header comment.
iii. **One file per backend swap:** each `api/[domain].ts` opens with a header comment mapping every exported function to its real endpoint, plus a `SWAP →` note on mocked bodies, so moving from mock to real never touches `hooks/api/` or `features/`.
iv. **Async state management:** every server read goes through a `hooks/api/[domain]/` TanStack Query hook. Components and feature hooks never call `api/*.ts` directly and never `useEffect`-fetch.
v. **Server prefetch:** a Server Component may prefetch with the exported `queryOptions` and hand off with `<HydrationBoundary>` (see state contract §5). It prefetches only — it does not render the query result itself, or the page drifts out of sync with client revalidation. Queries go through route handlers/`fetch`, not Server Actions (Actions run serially and are meant for mutations).
vi. **Mutations:** `useMutation` hook → `api/` function → route handler. **Server Actions are not part of the default flow.** Adopt them for a domain only when the build plan says so; they must then follow every rule here (treated like public endpoints: verify the session, validate with the shared Zod schema) and still sit behind a `hooks/api/` hook so features don't care about the transport.
vii. **Auth & authorization are layered, and a layout is not a guard.** Layouts don't re-render on client navigation and don't stop child segments from rendering.
   - `proxy.ts` (named `middleware.ts` on Next.js ≤ 15): **optimistic** redirect from the session cookie only — no database calls.
   - `lib/auth/dal.ts` (`server-only`): a `verifySession()` Data Access Layer function, memoised with React `cache()`. **Call it where the data is read** — Server Components that load private data, Route Handlers, Server Actions — and return DTOs, never raw records.
   - Route groups like `(auth)` / `(app)` organise layouts; they are not security.
   - Cookie flags: `httpOnly`, `secure`, `sameSite`, bounded lifetime. Tokens never go to `localStorage` or context.
viii. **UI fallbacks:** prefer skeletons (`loading.tsx`, `<Suspense fallback>`) over centred spinners for cold starts; every segment that fetches has an `error.tsx`; unknown resources call `notFound()`.
ix. **Caching is stated, not defaulted:** each fetch/route handler says whether it is static, revalidated (and when) or per-request. Check the installed Next.js version's caching model before assuming a default.

## 5. Documentation & Readability Mandates

i. **Comments/JSDoc:** See [comments-and-jsdoc-contract.md](./comments-and-jsdoc-contract.md) — short version: JSDoc for exported functions, plain comments only for genuine traps, 2 lines max, sound human.
ii. **Human-Readable Naming:** No cryptic abbreviations — `products.filter((product) => product.author === currentAuthor)`, not `prd.filter((i) => i.a === auth)`.

## 6. Frontend Environment & Fraud Guardrail Protocol

i. **Public client keys:** Only `NEXT_PUBLIC_*` variables are bundled into the browser. They are public by design — never gate sensitive behaviour on their mere presence.
ii. **Server env:** secrets are read **only** in `lib/env.server.ts` (`server-only`), parsed with Zod at start-up so a missing variable fails fast. `process.env` is read nowhere else (an architecture test enforces it). Commit `.env.example`, never real `.env*` files.
iii. **Carding & fraud prevention (PSP integrations):** any payment/checkout flow (Stripe, Adyen, PayPal) MUST validate a server-issued checkout session and a bot-verification token (Turnstile / reCAPTCHA v3 rendered in the browser) **in the route handler** before dispatching to the PSP. Never call PSP secret APIs from the browser. Webhooks verify the vendor signature and are idempotent. A browser cannot rate-limit itself — enforcement lives server-side (edge/WAF or the handler).
iv. **Domain/origin locking:** scope public client keys to this app's production and preview origins in vendor dashboards. Mutating handlers that rely on cookie auth check `Origin` (and use `sameSite`); Server Actions get an origin check from Next.js.
v. **Security headers & output:** CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` and `frame-ancestors` are configured in `next.config.mjs` (`headers()`) or `proxy.ts`. No `dangerouslySetInnerHTML` with unsanitised content; validate any user-supplied URL before rendering it as `href`/`src`.

## 7. Web Route Chrome (what a route owns besides rendering a feature)

i. **Metadata & SEO:** `metadata` / `generateMetadata`, `sitemap.ts`, `robots.ts` and Open Graph data live in `app/` next to the route. One `<h1>` per page.
ii. **Next.js built-ins over hand-rolled:** `next/image` (explicit `width`/`height`, or `fill` + `sizes`; `priority` only for the LCP image), `next/font` (never a CSS `@import` of a font host), `next/link` for internal navigation.
iii. **No layout shift:** reserve space for images, embeds and async content; skeletons match the final layout.
iv. **Navigation side effects** (`router.push/replace/back`) live in feature hooks, not in `app/` routes.

## 8. Extensibility & Future-Proofing Protocol

i. **Open-Closed Principle:** features/screens open for extension, closed for modification.
ii. **Polymorphic & slot patterns:** prefer slot props (`action={<Button>Click</Button>}`) or discriminated unions over boolean flags that can't compose (`showButton`/`buttonText` fails the moment a second action or a timer is needed).
iii. **Extensible data contracts:** types in `features/[feature]/types/` use discriminated unions/open metadata so new variants don't force breaking changes — e.g. `SessionStatus = 'initializing' | 'unauthenticated' | 'authenticated'` is easy to extend without touching every consumer.

## 9. AI Execution Protocol

- Build every feature in these stages, in this order, inside the continuous run — don't write UI before the types, schema and api layers it depends on exist.
- **Stage 1:** Types + Zod schema (`features/[feature]/types/`, `schemas/`).
- **Stage 2:** `api/[domain].ts` (mock first, `SWAP →` comment included) + `app/api/[domain]/route.ts` if a BFF is needed + `hooks/api/[domain]/queries.ts` and `use[Action].ts`.
- **Stage 3:** `context/` addition only if the feature needs app-wide singleton state; otherwise skip straight to the feature hook.
- **Stage 4:** `features/[feature]/hooks/use-[x]-form.ts` (orchestration) + `components/*.tsx` (presentation).
- **Stage 5:** Wire the route in `app/` (page, metadata, `loading.tsx`, `error.tsx`). If the data is private, confirm `verifySession()` is called where the data is read — don't re-guard per layout or per screen.
- **Stage 6:** Unit + architecture tests for the new pieces, then `verify` ([verification-contract.md](./verification-contract.md)).
