import Link from "next/link"

import { FacebookIcon, InstagramIcon, LogoMonoIcon, TiktokIcon } from "@/components/icons"
import { Container } from "@/components/shared/container"
import { buttonVariants } from "@/components/ui/button-variants"
import { footerColumns, promoBar } from "@/content/navigation"
import { NewsletterForm } from "@/features/content/components/newsletter-form"
import { siteConfig } from "@/lib/site"
import { cn } from "@/lib/utils"

const socials = [
  { label: "Instagram", href: siteConfig.social.instagram, Icon: InstagramIcon },
  { label: "Facebook", href: siteConfig.social.facebook, Icon: FacebookIcon },
  { label: "TikTok", href: siteConfig.social.tiktok, Icon: TiktokIcon },
]

/**
 * The black footer every designed screen ends with: promo bar, link columns, contact box. Home
 * also opens it with the newsletter sign-up (inside pages are designed without it).
 */
export function SiteFooter({ newsletter = false }: { newsletter?: boolean }) {
  return (
    <footer className="bg-foreground text-background">
      {newsletter ? (
        <section aria-labelledby="newsletter-title" className="flex flex-col items-center gap-3 px-4 pt-10 pb-10 text-center md:pt-16 md:pb-18">
          <p className="flex h-9 items-center bg-brand px-3 text-14 font-extrabold text-brand-foreground md:h-12 md:text-18">STAY CONNECTED</p>
          <h2 id="newsletter-title" className="text-28 font-black uppercase md:text-44">
            Stay in the drop
          </h2>
          <p className="max-w-158 text-16 font-medium text-muted-foreground md:text-18">
            Be the first to know about new arrivals, exclusive deals and limited drops.
          </p>
          <div className="flex w-full justify-center pt-4 md:pt-7">
            <NewsletterForm />
          </div>
        </section>
      ) : null}

      <div className="bg-brand text-brand-foreground">
        <Container className="flex flex-col items-start gap-3 py-4 sm:flex-row sm:items-center sm:justify-between md:h-20 md:py-0">
          <p className="text-14 font-extrabold uppercase md:text-18">{promoBar.text}</p>
          <Link href={promoBar.href} className={cn(buttonVariants({ tone: "ink-on-brand", size: "md" }), "w-45")}>
            {promoBar.cta}
          </Link>
        </Container>
      </div>

      <Container className="flex flex-col gap-8 pt-10 pb-8 md:pt-14">
        {/* Explicit minmax(0, 1fr) tracks: an implicit auto track grew to the address's min-content at 320 px. */}
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:gap-10 xl:grid-cols-4 3xl:grid-cols-footer 3xl:gap-0">
          <div className="col-span-2 flex max-w-130 flex-col items-start gap-4 xl:col-span-1 3xl:gap-0">
            <Link href="/" aria-label={`${siteConfig.name} — home`} className="flex">
              <LogoMonoIcon className="h-auto w-48 md:w-56" />
            </Link>
            <p className="max-w-96 text-16 font-semibold text-muted-foreground md:text-18 3xl:pt-5">{siteConfig.description}</p>
            <ul className="flex gap-3 3xl:pt-10 3xl:pb-10">
              {socials.map(({ label, href, Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${siteConfig.name} on ${label} (opens in a new tab)`}
                    className="flex size-12 items-center justify-center rounded-social bg-brand text-brand-foreground transition-colors hover:bg-background md:size-14"
                  >
                    <Icon className="size-8 md:size-9" />
                  </a>
                </li>
              ))}
            </ul>
            <address className="flex w-full flex-col gap-2 border-s-4 border-brand bg-ink-raised px-4 py-4 text-14 font-medium not-italic wrap-break-word md:px-6 md:py-5 md:text-16">
              <a href={siteConfig.contact.whatsappHref} className="hover:text-brand">WhatsApp: {siteConfig.contact.whatsappLabel}</a>
              <a href={`mailto:${siteConfig.contact.email}`} className="hover:text-brand">Email: {siteConfig.contact.email}</a>
              <span>Address: {siteConfig.contact.address}</span>
            </address>
          </div>
          {footerColumns.map((column) => (
            <nav key={column.title} aria-label={column.title} className="flex min-w-0 flex-col gap-3 md:gap-5">
              <h2 className="text-14 font-medium text-muted-foreground md:text-18">{column.title}</h2>
              <ul className="flex flex-col gap-2.5 md:gap-4">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="block w-fit text-14 leading-snug font-bold text-muted-foreground transition-colors hover:text-brand md:text-17">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="flex flex-col gap-5 3xl:px-0.75 3xl:pt-8">
          <hr className="border-border-strong" />
          <p className="text-14 font-medium text-muted-foreground md:text-16 3xl:ps-1.25">© 2026 SOLE DROP. All Rights Reserved.</p>
        </div>
      </Container>
    </footer>
  )
}
