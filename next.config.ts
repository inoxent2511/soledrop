import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV === "development"

/**
 * Content Security Policy without nonces (docs/app/design-decisions.md D-033): nonces would force
 * every page to render per request and lose static/ISR caching. Scripts are same-origin only;
 * 'unsafe-inline' covers Next's inline flight data. Card payments leave the site by redirect
 * (Stripe Checkout), so no third-party script, frame or connection is allowed.
 * No `upgrade-insecure-requests`: every URL is same-origin and relative, HSTS already pins HTTPS, and
 * WebKit applies the upgrade even on loopback, which broke the production build served over HTTP (BUG-009).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
]

/** Every path except /admin and below. */
export const STOREFRONT = "/:path((?!admin(?:/|$)).*)"

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Dockerfile (docs/DEPLOYMENT-RUNBOOK.md).
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": ["./.data/**/*", "./.env*", "./.git/**/*", "./.email-outbox/**/*", "./qa/out/**/*"],
  },
  // sharp's native addon loads libvips through the OS loader, which file tracing can't follow;
  // without these libraries /_next/image silently serves every original photo (BUG-016).
  outputFileTracingIncludes: {
    "/*": ["./node_modules/.pnpm/@img+sharp-*/node_modules/@img/*/lib/**/*"],
  },
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    // Product photos are served from /public/images; a CDN host is added here when photos move (phase-2.md).
    remotePatterns: [],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The admin gets a stricter per-request nonce CSP from proxy.ts instead (admin-design.md).
      { source: STOREFRONT, headers: [{ key: "Content-Security-Policy", value: csp }] },
      // Personal and transactional responses are never cached by browsers or CDNs.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ]
  },
}

export default nextConfig
