import type { Metadata, Viewport } from "next"
import { Montserrat } from "next/font/google"
import localFont from "next/font/local"

import "./globals.css"
import { Providers } from "@/components/providers"
import { ThemeProvider } from "@/components/theme-provider"
import tokens from "@/docs/app/design-tokens.json"
import { siteConfig } from "@/lib/site"
import { serverSiteUrl } from "@/lib/site-server"
import { cn } from "@/lib/utils"

// Inter 3.19 (OFL, app/fonts/inter-LICENSE.txt): the build Figma sets the design in. Google's Inter 4
// gives "1" and several letters narrower advances, shifting every price and label (D-037).
const inter = localFont({ src: "./fonts/inter-3.19-roman.var.woff2", weight: "100 900", variable: "--font-inter", display: "swap" })
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-montserrat",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(serverSiteUrl()),
  title: { default: `${siteConfig.name} — ${siteConfig.tagline}`, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
  openGraph: { type: "website", siteName: siteConfig.name, locale: "en_PK" },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: tokens.colors.foreground.value,
  colorScheme: "light",
  viewportFit: "cover",
}

/**
 * Root document: fonts, theme and data providers, and the skip link. Locale and direction come from the
 * site config (English, LTR) until a second locale ships (docs/app/phase-2.md).
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang={siteConfig.locale}
      dir={siteConfig.dir}
      suppressHydrationWarning
      className={cn("antialiased", inter.variable, montserrat.variable)}
    >
      <body>
        <a
          href="#main"
          className="sr-only z-toast bg-brand px-4 py-3 font-bold text-brand-foreground focus:not-sr-only focus:fixed focus:top-2 focus:start-2"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  )
}
