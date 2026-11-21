import type { Metadata } from "next"
import type { ComponentType, SVGProps } from "react"

import { ArrowRightIcon, EmailIcon, FacebookIcon, InstagramIcon, TiktokIcon, WhatsappIcon } from "@/components/icons"
import { Container } from "@/components/shared/container"
import { PageBand } from "@/components/shared/page-band"
import { ContactForm } from "@/features/content/components/contact-form"
import { siteConfig } from "@/lib/site"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Contact us",
  description: "Message Sole Drop, chat on WhatsApp or email us about an order, a size or a pair.",
  alternates: { canonical: "/contact" },
}

const card = "flex flex-col rounded-panel bg-background p-4 shadow-card-lift md:p-8"
const cardTitle = "text-22 font-extrabold uppercase md:text-30"
const cardIntro = "pt-3 text-16 font-semibold text-faint-foreground md:text-20"

const socials: { label: string; href: string; Icon: ComponentType<SVGProps<SVGSVGElement>>; size: string }[] = [
  { label: "Instagram", href: siteConfig.social.instagram, Icon: InstagramIcon, size: "size-11 md:size-14.5" },
  { label: "Facebook", href: siteConfig.social.facebook, Icon: FacebookIcon, size: "h-11 w-auto md:h-14.5" },
  { label: "TikTok", href: siteConfig.social.tiktok, Icon: TiktokIcon, size: "h-11 w-auto md:h-14.5" },
]

/** Contact Us (screen 06): message form beside WhatsApp, email, socials and support days. */
export default function ContactPage() {
  const channels = [
    {
      title: "WhatsApp",
      text: "Chat with our team",
      href: siteConfig.contact.whatsappHref,
      external: true,
      Icon: WhatsappIcon,
      tone: "bg-brand text-brand-foreground hover:bg-foreground hover:text-brand",
      gap: "md:gap-2.5",
    },
    {
      title: "Email us",
      text: siteConfig.contact.email,
      href: `mailto:${siteConfig.contact.email}`,
      external: false,
      Icon: EmailIcon,
      tone: "bg-foreground text-background hover:bg-brand hover:text-brand-foreground",
      gap: "md:gap-2.25",
    },
  ]

  return (
    <div className="bg-surface">
      <PageBand>Get in touch</PageBand>

      <Container className="grid grid-cols-1 items-start gap-5 pt-7 pb-12 lg:grid-cols-2 lg:gap-8 3xl:pt-18 3xl:pb-28">
        <section aria-labelledby="contact-form-title" className={card}>
          <h2 id="contact-form-title" className={cardTitle}>
            Send a message
          </h2>
          <p className={cardIntro}>Fill out the form below and we&rsquo;ll get back to you as soon as possible.</p>
          <div className="pt-6 md:pt-8">
            <ContactForm />
          </div>
        </section>

        <section aria-labelledby="quick-help-title" className={card}>
          <h2 id="quick-help-title" className={cardTitle}>
            Need quick help?
          </h2>
          <p className={cardIntro}>Chat with us directly or Email us. We&rsquo;re always happy to assist</p>
          <ul className="flex flex-col gap-4 pt-5 md:pt-7">
            {channels.map(({ title, text, href, external, Icon, tone, gap }) => (
              <li key={title}>
                <a
                  href={href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className={cn("flex h-18 items-center gap-2 rounded-xl ps-4 pe-4 transition-colors md:h-24 md:ps-5 md:pe-8", gap, tone)}
                >
                  <span className="flex size-12 shrink-0 items-center justify-center md:size-17.5">
                    <Icon className="h-auto w-full max-w-full" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1 md:gap-3.25">
                    <span className="text-18 font-extrabold uppercase md:text-24">{title}</span>
                    <span className="truncate text-16 font-medium md:text-20">{text}</span>
                  </span>
                  <ArrowRightIcon className="h-auto w-7 shrink-0 md:w-9.75" />
                  {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
                </a>
              </li>
            ))}
          </ul>

          <h3 className="pt-9 text-20 font-extrabold uppercase md:pt-11.25 md:text-26">Follow us</h3>
          <p className="pt-2 text-16 font-semibold text-faint-foreground md:pt-3.25 md:text-20">Stay updated on new drops, offers and more.</p>
          <ul className="flex gap-6 pt-5 md:gap-10 md:pt-6.5">
            {socials.map(({ label, href, Icon, size }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${siteConfig.name} on ${label} (opens in a new tab)`}
                  className="flex size-16 items-center justify-center rounded-lg bg-brand text-brand-foreground transition-colors hover:bg-foreground hover:text-brand md:size-22"
                >
                  <Icon className={size} />
                </a>
              </li>
            ))}
          </ul>

          <div className="pt-6 md:pt-8.5">
            <p className="flex h-32 flex-col justify-center rounded-xl border-2 border-stroke-soft bg-foreground ps-10 text-background md:h-50 md:justify-start md:ps-25.5 md:pt-17">
              <span className="sr-only">Support days: </span>
              <span className="font-display text-22 font-extrabold md:text-26">{siteConfig.contact.supportDays}</span>
              {siteConfig.contact.supportHours ? <span className="pt-2 text-18 font-medium text-muted-foreground">{siteConfig.contact.supportHours}</span> : null}
            </p>
          </div>
        </section>
      </Container>
    </div>
  )
}
