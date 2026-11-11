# Project structure — canonical web layout

This is the **target tree** every project follows. Folders that a project doesn't need yet (no backend → no `api/`, no persisted client state → no `context/`) are simply absent; nothing is added "for scale". When a project's real tree differs, update this file in the same commit.

```
project-root/
├── app/                              Next.js App Router — routes only
│   ├── layout.tsx                    <html lang dir>, next/font, metadata, <Providers>
│   ├── globals.css                   imports tailwindcss, tw-animate-css, styles/tokens.generated.css
│   ├── (marketing)/ (app)/ (auth)/   route groups organise layouts — they are NOT security
│   │   └── <route>/
│   │       ├── page.tsx              Server Component: imports one feature component, owns metadata
│   │       ├── loading.tsx           skeleton that matches the final layout
│   │       └── error.tsx             "use client" wrapper around the shared error view
│   ├── api/<domain>/route.ts         BFF route handlers (only if there is a backend / third party)
│   ├── not-found.tsx · global-error.tsx · sitemap.ts · robots.ts · manifest.ts
├── proxy.ts                          optimistic auth redirects from the session cookie (middleware.ts on Next ≤ 15)
├── api/<domain>.ts                   typed request functions; header comment = swap boundary
├── hooks/
│   ├── api/<domain>/
│   │   ├── queries.ts                queryOptions factories — no "use client", no hooks
│   │   └── use<Action>.ts            one TanStack Query hook per action
│   └── use-media-query.ts …          shared, feature-agnostic hooks
├── context/
│   ├── <Name>Context.tsx             sole owner of its persisted state / lifecycle; one use<Name>() hook
│   └── <name>-state.ts               pure state shape, defaults, reducer, normalize(), migrate()
├── features/<feature>/
│   ├── components/                   presentation: screens, cards, <x>-form.tsx
│   ├── hooks/                        orchestration: use-<x>-form.ts, navigation, derived data
│   ├── schemas/<name>.schema.ts      Zod schemas + z.infer types (also imported by route handlers)
│   ├── types/index.ts                domain + API payload types (discriminated unions)
│   └── store/                        ONLY if Zustand has been justified (state contract §2)
├── components/
│   ├── ui/                           shadcn primitives we own: cva variants, data-slot, semantic tokens
│   ├── shared/                       chrome/composites used by 2+ features: container, header, nav, providers…
│   └── icons/                        custom SVG icons as React components (currentColor)
├── content/                          bundled data/copy per language; pure data + typed loaders, no React
├── lib/
│   ├── utils.ts                      cn()
│   ├── env.ts · env.server.ts        client-safe env / server-only env, Zod-validated
│   ├── query-client.ts               getQueryClient(): per-request on server, singleton in browser
│   ├── auth/ (server-only)           session.ts · dal.ts (verifySession, DTO helpers)
│   └── i18n/ · format/ …             pure helpers
├── styles/
│   └── tokens.generated.css          GENERATED from design/spec — never hand-edit
├── design/                           Figma export (see FIGMA-DESIGN-HANDOFF.md)
│   ├── README.md · spec/ · screens/ · icons/ · illustrations/ · photos/
├── public/                           static assets served as-is
├── scripts/
│   ├── check-design.mjs              the design gate: is design/ complete and consistent? (Phase 0)
│   └── generate-theme.mjs            design/spec → styles/tokens.generated.css (+ --check)
├── tests/                            unit tests + architecture.test.ts
├── e2e/                              Playwright flows, axe checks
├── components.json                   shadcn CLI config (aliases, style, css path)
├── next.config.mjs                   security headers, images, build options
└── docs/                             these contracts + docs/app/ for product-specific docs
```

## What each folder may import

| Folder | May import |
|---|---|
| `app/**/page.tsx`, `layout.tsx` | `features/*/components`, `components/shared`, `hooks/api/*/queries.ts` (prefetch only), `lib/auth` (server) |
| `app/api/**` | `features/*/schemas`, `features/*/types`, `lib/auth`, `lib/env.server` |
| `features/*/components` | the feature's hooks, `components/ui`, `components/shared`, `next/link` |
| `features/*/hooks` | `hooks/api/*`, `context/*` hooks, `lib/*`, `content/*` loaders, `next/navigation` |
| `hooks/api/*` | `api/*`, `features/*/types` |
| `api/*` | `lib/*`, `features/*/types` |
| `context/*` | storage (only here), `lib/*` |
| `components/ui` | `radix-ui`, `lucide-react`, `lib/utils` |
| `components/shared` | `components/ui`, context hooks |
| `content/`, `lib/` | nothing app-specific — pure |

## Rules

- Features don't import each other's internals. Shared pieces move to `components/shared/`, `context/`, `hooks/` or `lib/`.
- A file's name says what it is: `use-note-form.ts`, `note-form.tsx`, `note.schema.ts` — kebab-case files, PascalCase components, `use` prefix for hooks.
- Location rule for components: generic primitives in `components/ui/`; used by 2+ features in `components/shared/`; used by one feature in `features/<feature>/components/`.
- Generated files (`styles/tokens.generated.css`) carry a "generated — don't edit" banner and are rewritten only by their script.
- Delete what the design or product removed — code, tests, content and tokens. Git remembers.
