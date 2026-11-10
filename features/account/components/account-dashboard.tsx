"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useState, type FormEvent, type ReactNode } from "react"

import { accountApi } from "@/api/account"
import { Container } from "@/components/shared/container"
import { PageBand } from "@/components/shared/page-band"
import { control, FormError, FormField, useSchemaForm } from "@/features/account/components/form-field"
import { changePasswordSchema, deleteAccountSchema, profileSchema, savedAddressSchema } from "@/features/account/schemas/auth"
import { PROVINCES } from "@/features/checkout/schemas/checkout"
import { useAccountMutation, useLogout } from "@/hooks/api/account/queries"
import { useHydrated } from "@/hooks/use-hydrated"
import { formatDate, formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CustomerAddress, CustomerProfile } from "@/server/customers/types"
import type { OrderDto } from "@/server/http/dto"

const card = "flex flex-col gap-6 rounded-xl bg-background p-5 outline-1 outline-border-strong md:p-7.5"
const heading = "text-24 font-bold md:text-28"
const primary = "flex h-14 items-center justify-center rounded-lg bg-foreground px-6 text-18 font-semibold text-background transition-colors hover:bg-brand hover:text-brand-foreground disabled:opacity-50 md:text-20"
const secondary = "flex h-14 items-center justify-center rounded-lg border-2 border-foreground px-6 text-18 font-semibold transition-colors hover:bg-foreground hover:text-background disabled:opacity-50 md:text-20"
const values = (form: HTMLFormElement) => Object.fromEntries(new FormData(form)) as Record<string, string>

type Props = { customer: CustomerProfile; orders: OrderDto[]; addresses: CustomerAddress[] }

/**
 * The account (derived from the bag and Contact cards). Orders first — the reason most people
 * come here — then details, addresses, password and privacy. Every change goes through the
 * account API and refreshes the server-rendered page.
 */
export function AccountDashboard({ customer, orders, addresses }: Props) {
  const router = useRouter()
  const logout = useLogout()

  return (
    <div className="bg-surface">
      <PageBand description={`Signed in as ${customer.email}`}>Hi, {customer.fullName.split(" ")[0]}</PageBand>
      <Container className="grid grid-cols-1 items-start gap-8 pt-8 pb-16 md:pt-14 md:pb-24 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10 3xl:px-50">
        <nav aria-label="Account" className="flex flex-col gap-1 lg:sticky lg:top-27.5">
          {[
            ["#orders", "Orders"],
            ["#details", "Your details"],
            ["#addresses", "Addresses"],
            ["#password", "Password"],
            ["#privacy", "Privacy"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="flex min-h-11 items-center rounded-lg px-3 text-18 font-semibold hover:bg-background">
              {label}
            </a>
          ))}
          <button
            type="button"
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSuccess: () => router.replace("/") })}
            className="flex min-h-11 items-center rounded-lg px-3 text-start text-18 font-semibold text-destructive hover:bg-background"
          >
            {logout.isPending ? "Signing out…" : "Sign out"}
          </button>
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          <Orders orders={orders} />
          <Details customer={customer} />
          <Addresses addresses={addresses} />
          <Password />
          <Privacy />
        </div>
      </Container>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn(card, "scroll-mt-28")}>
      <h2 id={`${id}-title`} className={heading}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Orders({ orders }: { orders: OrderDto[] }) {
  return (
    <Section id="orders" title="Orders">
      {orders.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-18 text-subtle-foreground md:text-20">No orders yet. Your next pair is waiting.</p>
          <Link href="/new-arrivals" className={primary}>
            Shop new arrivals
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {orders.map((order) => (
            <li key={order.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4 first:pt-0 last:pb-0">
              <span className="flex flex-col gap-1">
                <Link href={`/orders/${order.number}`} className="text-18 font-semibold underline-offset-4 hover:underline md:text-20">
                  Order {order.number}
                </Link>
                <span className="text-16 text-subtle-foreground md:text-18">
                  {formatDate(order.placedAt)} · {order.lines.reduce((sum, line) => sum + line.quantity, 0)} items
                </span>
              </span>
              <span className="flex items-center gap-4">
                <span className="rounded-sm bg-surface px-3 py-1.5 text-16 font-semibold">{order.statusLabel}</span>
                <span className="text-18 font-semibold md:text-20">{formatPrice(order.total, order.currency, { symbol: true })}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function Saved({ message }: { message: string | null }) {
  return (
    <p role="status" className="text-16 font-semibold text-success empty:hidden">
      {message}
    </p>
  )
}

function Details({ customer }: { customer: CustomerProfile }) {
  const id = useId()
  const hydrated = useHydrated()
  const router = useRouter()
  const save = useAccountMutation(accountApi.updateProfile)
  const { errors, formError, validate, fail } = useSchemaForm(profileSchema)
  const [saved, setSaved] = useState<string | null>(null)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const input = validate(form, { ...values(form), marketingOptIn: new FormData(form).get("marketingOptIn") === "on" })
    if (!input) return
    setSaved(null)
    save.mutate(input, {
      onSuccess: () => {
        setSaved("Details saved.")
        router.refresh()
      },
      onError: fail,
    })
  }

  return (
    <Section id="details" title="Your details">
      <form method="post" noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        <div className="grid gap-5 md:grid-cols-2">
          <FormField formId={id} name="fullName" label="Full name" autoComplete="name" defaultValue={customer.fullName} error={errors.fullName} />
          <FormField formId={id} name="phone" type="tel" label="Mobile number (optional)" autoComplete="tel" defaultValue={customer.phone ?? ""} error={errors.phone} />
        </div>
        <label className="flex min-h-11 items-center gap-3 text-16 font-medium md:text-18">
          <input type="checkbox" name="marketingOptIn" defaultChecked={customer.marketingOptIn} className="size-5 accent-foreground" />
          Email me new drops and offers
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={!hydrated || save.isPending} className={primary}>
            {save.isPending ? "Saving…" : "Save details"}
          </button>
          <Saved message={saved} />
        </div>
        <FormError>{formError}</FormError>
      </form>
    </Section>
  )
}

function Addresses({ addresses }: { addresses: CustomerAddress[] }) {
  const router = useRouter()
  const remove = useAccountMutation(accountApi.deleteAddress)
  const [editing, setEditing] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const done = (text: string) => {
    setEditing(null)
    setMessage(text)
    router.refresh()
  }

  return (
    <Section id="addresses" title="Addresses">
      <Saved message={message} />
      {addresses.length === 0 && editing !== "new" ? <p className="text-18 text-subtle-foreground md:text-20">No saved addresses. Add one here or tick “Save this address” at checkout.</p> : null}
      <ul className="grid gap-4 md:grid-cols-2">
        {addresses.map((address) =>
          editing === address.id ? (
            <li key={address.id} className="md:col-span-2">
              <AddressForm address={address} onDone={() => done("Address saved.")} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={address.id} className="flex flex-col gap-3 rounded-lg border-2 border-border p-4">
              <p className="flex flex-wrap items-center gap-2 text-18 font-semibold">
                {address.fullName}
                {address.isDefault ? <span className="rounded-sm bg-brand px-2 py-0.5 text-14 text-brand-foreground">Default</span> : null}
              </p>
              <p className="text-16 text-subtle-foreground md:text-18">
                {[address.line1, address.line2, `${address.city}, ${address.province}`, address.phone].filter(Boolean).join(" · ")}
              </p>
              <div className="flex gap-4">
                <button type="button" onClick={() => setEditing(address.id)} aria-label={`Edit address for ${address.fullName}, ${address.line1}`} className="min-h-11 text-16 font-semibold underline-offset-4 hover:underline">
                  Edit
                </button>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(address.id, { onSuccess: () => done("Address removed.") })}
                  aria-label={`Remove address for ${address.fullName}, ${address.line1}`}
                  className="min-h-11 text-16 font-semibold text-destructive underline-offset-4 hover:underline"
                >
                  Remove
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <AddressForm onDone={() => done("Address added.")} onCancel={() => setEditing(null)} />
      ) : (
        <button type="button" onClick={() => setEditing("new")} className={cn(secondary, "self-start")}>
          Add an address
        </button>
      )}
    </Section>
  )
}

function AddressForm({ address, onDone, onCancel }: { address?: CustomerAddress; onDone: () => void; onCancel: () => void }) {
  const id = useId()
  const hydrated = useHydrated()
  const save = useAccountMutation((input: Parameters<typeof accountApi.saveAddress>[0]) => accountApi.saveAddress(input, address?.id))
  const { errors, formError, validate, fail } = useSchemaForm(savedAddressSchema)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const input = validate(form, { ...values(form), country: "PK", isDefault: new FormData(form).get("isDefault") === "on" })
    if (input) save.mutate(input, { onSuccess: onDone, onError: fail })
  }

  return (
    <form method="post" noValidate onSubmit={onSubmit} aria-label={address ? "Edit address" : "New address"} className="flex flex-col gap-5 rounded-lg border-2 border-foreground p-4 md:p-5">
      <div className="grid gap-5 md:grid-cols-2">
        <FormField formId={id} name="fullName" label="Full name" autoComplete="name" defaultValue={address?.fullName} error={errors.fullName} />
        <FormField formId={id} name="phone" type="tel" label="Mobile number" autoComplete="tel" defaultValue={address?.phone} error={errors.phone} />
        <FormField formId={id} name="line1" label="House and street" autoComplete="address-line1" defaultValue={address?.line1} error={errors.line1} />
        <FormField formId={id} name="line2" label="Area or landmark (optional)" autoComplete="address-line2" defaultValue={address?.line2} error={errors.line2} />
        <FormField formId={id} name="city" label="City" autoComplete="address-level2" defaultValue={address?.city} error={errors.city} />
        <div className="flex flex-col gap-2.5">
          <label htmlFor={`${id}-province`} className="text-18 font-bold md:text-20">
            Province
          </label>
          <select
            id={`${id}-province`}
            name="province"
            defaultValue={address?.province ?? ""}
            autoComplete="address-level1"
            aria-invalid={errors.province ? true : undefined}
            aria-describedby={errors.province ? `${id}-province-error` : undefined}
            className={cn(control, "appearance-auto")}
          >
            <option value="">Choose…</option>
            {PROVINCES.map((province) => (
              <option key={province}>{province}</option>
            ))}
          </select>
          {errors.province ? (
            <p id={`${id}-province-error`} className="text-16 font-medium text-destructive">
              {errors.province}
            </p>
          ) : null}
        </div>
        <FormField formId={id} name="postalCode" label="Postal code (optional)" inputMode="numeric" autoComplete="postal-code" defaultValue={address?.postalCode} error={errors.postalCode} />
      </div>
      <label className="flex min-h-11 items-center gap-3 text-16 font-medium md:text-18">
        <input type="checkbox" name="isDefault" defaultChecked={address?.isDefault} className="size-5 accent-foreground" />
        Use as my default address
      </label>
      <div className="flex flex-wrap gap-4">
        <button type="submit" disabled={!hydrated || save.isPending} className={primary}>
          {save.isPending ? "Saving…" : "Save address"}
        </button>
        <button type="button" onClick={onCancel} className={secondary}>
          Cancel
        </button>
      </div>
      <FormError>{formError}</FormError>
    </form>
  )
}

function Password() {
  const id = useId()
  const hydrated = useHydrated()
  const change = useAccountMutation(accountApi.changePassword)
  const { errors, formError, validate, fail } = useSchemaForm(changePasswordSchema)
  const [saved, setSaved] = useState<string | null>(null)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const input = validate(form, values(form))
    if (!input) return
    setSaved(null)
    change.mutate(input, {
      onSuccess: () => {
        form.reset()
        setSaved("Password changed.")
      },
      onError: fail,
    })
  }

  return (
    <Section id="password" title="Password">
      <form method="post" noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        <div className="grid gap-5 md:grid-cols-2">
          <FormField formId={id} name="currentPassword" type="password" label="Current password" autoComplete="current-password" error={errors.currentPassword} />
          <FormField formId={id} name="newPassword" type="password" label="New password" autoComplete="new-password" hint="At least 8 characters, with letters and a number." error={errors.newPassword} />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={!hydrated || change.isPending} className={primary}>
            {change.isPending ? "Saving…" : "Change password"}
          </button>
          <Saved message={saved} />
        </div>
        <FormError>{formError}</FormError>
      </form>
    </Section>
  )
}

function Privacy() {
  const id = useId()
  const hydrated = useHydrated()
  const router = useRouter()
  const remove = useAccountMutation(accountApi.deleteAccount)
  const { errors, formError, validate, fail } = useSchemaForm(deleteAccountSchema)
  const [open, setOpen] = useState(false)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = validate(event.currentTarget, values(event.currentTarget))
    if (input) remove.mutate(input, { onSuccess: () => router.replace("/"), onError: fail })
  }

  return (
    <Section id="privacy" title="Privacy">
      <p className="text-18 text-subtle-foreground md:text-20">Download everything we hold about you, or delete your account. Orders are kept, without your name or contact details, because tax law requires the amounts.</p>
      <div className="flex flex-wrap gap-4">
        <a href="/api/account/export" download className={secondary}>
          Download my data
        </a>
        {open ? null : (
          <button type="button" onClick={() => setOpen(true)} className={cn(secondary, "border-destructive text-destructive hover:bg-destructive")}>
            Delete my account
          </button>
        )}
      </div>
      {open ? (
        <form method="post" noValidate onSubmit={onSubmit} aria-label="Delete account" className="flex flex-col gap-5 rounded-lg border-2 border-destructive p-4 md:p-5">
          <p className="text-18 font-semibold">This signs you out and permanently removes your account. It can&rsquo;t be undone.</p>
          <div className="grid gap-5 md:grid-cols-2">
            <FormField formId={id} name="password" type="password" label="Your password" autoComplete="current-password" error={errors.password} />
            <FormField formId={id} name="confirm" label="Type DELETE to confirm" autoComplete="off" error={errors.confirm} />
          </div>
          <div className="flex flex-wrap gap-4">
            <button type="submit" disabled={!hydrated || remove.isPending} className={cn(primary, "bg-destructive hover:bg-foreground hover:text-background")}>
              {remove.isPending ? "Deleting…" : "Delete account"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={secondary}>
              Keep my account
            </button>
          </div>
          <FormError>{formError}</FormError>
        </form>
      ) : null}
    </Section>
  )
}
