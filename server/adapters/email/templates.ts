import "server-only"

import tokens from "@/docs/app/design-tokens.json"
import { serverSiteUrl } from "@/lib/site-server"
import { serverEnv } from "@/lib/env.server"
import { openDeliveryPayload } from "@/server/platform/private-payload"
import { siteConfig } from "@/lib/site"
import type { EmailMessage } from "@/server/adapters/email"
import type { OutboxEvent } from "@/server/platform/types"

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
const rupees = (minor: number) => `Rs. ${(minor / 100).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`

// Mail clients ignore CSS variables, so the design tokens are inlined as values.
const color = {
  text: tokens.colors.foreground.value,
  brand: tokens.colors.brand.value,
  onBrand: tokens.colors["brand-foreground"].value,
  secondary: tokens.colors["subtle-foreground"].value,
}

function layout(title: string, paragraphs: string[], action?: { label: string; href: string }) {
  const body = paragraphs.map((text) => `<p style="margin:0 0 16px;font:16px/1.5 Arial,sans-serif;color:${color.text}">${escape(text)}</p>`).join("")
  const button = action
    ? `<p><a href="${escape(action.href)}" style="display:inline-block;background:${color.brand};color:${color.onBrand};font:700 16px Arial,sans-serif;padding:14px 24px;border-radius:8px;text-decoration:none">${escape(action.label)}</a></p>`
    : ""
  return `<div style="max-width:560px;margin:0 auto;padding:32px 24px"><h1 style="font:900 28px Arial,sans-serif;margin:0 0 24px;color:${color.text}">${escape(title)}</h1>${body}${button}<p style="font:14px Arial,sans-serif;color:${color.secondary};margin-top:32px">${escape(siteConfig.name)} · ${escape(siteConfig.contact.address)}</p></div>`
}

function message(to: string, subject: string, paragraphs: string[], action?: { label: string; href: string }): EmailMessage {
  return {
    to,
    subject,
    text: [...paragraphs, action ? `${action.label}: ${action.href}` : ""].filter(Boolean).join("\n\n"),
    html: layout(subject, paragraphs, action),
  }
}

/** Customer-facing email for an event, or null when the event has no email. */
export function renderEventEmail(event: OutboxEvent): EmailMessage | null {
  const data = openDeliveryPayload(event.payload, serverEnv.SESSION_SECRET) as Record<string, string | number | null | undefined>
  const site = serverSiteUrl()
  switch (event.topic) {
    case "order.placed":
      return message(
        String(data.email),
        `Order ${data.number} confirmed`,
        [
          `Thanks for your order, ${data.firstName ?? "there"}! We've received order ${data.number} for ${rupees(Number(data.total))}.`,
          data.paymentMethod === "bank_transfer"
            ? "Please complete your bank transfer using the details on your order page — we'll ship as soon as it arrives."
            : "You'll pay cash on delivery. We'll email you again when your pair ships.",
        ],
        { label: "View your order", href: `${site}/orders/${data.number}?token=${data.accessToken}` },
      )
    case "order.status_changed":
      if (data.to === "shipped") {
        return message(String(data.email), `Order ${data.number} is on its way`, [
          `Your order has shipped${data.trackingNumber ? ` — tracking number ${data.trackingNumber}` : ""}.`,
        ])
      }
      if (data.to === "cancelled") return message(String(data.email), `Order ${data.number} was cancelled`, ["Your order has been cancelled. Any payment will be refunded in full."])
      return null
    case "refund.created":
      return message(String(data.email), `Refund for order ${data.number}`, [`We've refunded ${rupees(Number(data.amount))} for order ${data.number}.`])
    case "customer.registered":
      return message(String(data.email), "Welcome to Sole Drop", ["Your account is ready. Track orders, save addresses and check out faster next time."], { label: "Shop new arrivals", href: `${site}/collections/new-arrivals` })
    case "password.reset_requested":
      return message(String(data.email), "Reset your password", ["Someone asked to reset the password for this account. The link works for 30 minutes. If it wasn't you, ignore this email."], { label: "Choose a new password", href: `${site}/account/reset-password?token=${data.token}` })
    case "auth.link_requested":
      return message(String(data.email), data.kind === "magic_link" ? "Sign in to Sole Drop" : "Verify your email", ["This one-time link works for 15 minutes. If you didn't request it, ignore this email."], { label: data.kind === "magic_link" ? "Sign in" : "Verify email", href: `${site}/api/auth/link?kind=${data.kind}&token=${encodeURIComponent(String(data.token))}` })
    case "auth.security_changed":
      return message(String(data.email), "Your account security changed", ["Your account credentials were changed. If this wasn't you, contact us immediately and reset your password."])
    case "newsletter.subscribed":
      return message(String(data.email), "You're in the drop", ["Thanks for subscribing — you'll be first to hear about new arrivals, exclusive deals and limited drops."], { label: "Unsubscribe", href: `${site}/newsletter/unsubscribe?email=${encodeURIComponent(String(data.email))}&token=${data.token}` })
    default:
      return null
  }
}
