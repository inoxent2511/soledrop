"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * Theme follows the OS setting. There is no single-key shortcut: an unmodified character-key
 * shortcut fails WCAG 2.1.4 and fired while shoppers pressed "d" outside a text field (BUG-003).
 *
 * The admin is light-only and runs under a nonce CSP with no inline scripts (A-012), so it skips
 * the provider and the inline script it injects.
 */
function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const pathname = usePathname()
  if (pathname === "/admin" || pathname?.startsWith("/admin/")) return <>{children}</>
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

export { ThemeProvider }
