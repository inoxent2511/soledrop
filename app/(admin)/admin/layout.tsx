import type { Metadata } from "next"
import { connection } from "next/server"

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Sole Drop Admin" },
  robots: { index: false, follow: false },
}

/**
 * Everything under /admin renders per request: each response carries proxy.ts's fresh CSP nonce,
 * and no admin page may be cached or prerendered (A-012).
 */
export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  await connection()
  return children
}
