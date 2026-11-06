/**
 * The admin's Content Security Policy (A-012): scripts only from our origin or carrying this
 * request's nonce; 'strict-dynamic' lets nonce'd Next.js chunks load their own chunks. Nothing
 * inline runs otherwise (the theme provider's inline script is skipped on /admin). Style
 * attributes (Base UI positioning) need 'unsafe-inline' for styles only.
 */
export function adminCsp(nonce: string, dev = process.env.NODE_ENV === "development"): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ")
}
