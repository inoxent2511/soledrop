"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react"

import type { QuoteResponse } from "@/api/checkout"
import { ApiError } from "@/api/http"
import { Container } from "@/components/shared/container"
import { CheckoutSummary } from "@/features/checkout/components/checkout-summary"
import { PromoCodeForm } from "@/features/checkout/components/promo-code-form"
import { checkoutSchema, PROVINCES } from "@/features/checkout/schemas/checkout"
import { useCheckoutQuote, usePlaceOrder } from "@/hooks/api/checkout/mutations"
import { useHydrated } from "@/hooks/use-hydrated"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CustomerAddress } from "@/server/customers/types"
import type { CheckoutContext } from "@/server/http/checkout"

type AddressField = "fullName" | "phone" | "line1" | "line2" | "city" | "province" | "postalCode"
type Field = "email" | AddressField | "shippingCode" | "paymentMethod" | (string & {})
type Values = Record<AddressField, string> & { email: string }

const ADDRESS_FIELDS: { name: AddressField; label: string; autoComplete: string; type?: string; optional?: boolean; wide?: boolean }[] = [
  { name: "fullName", label: "Full name", autoComplete: "shipping name", wide: true },
  { name: "phone", label: "Mobile number", autoComplete: "shipping tel", type: "tel", wide: true },
  { name: "line1", label: "House and street", autoComplete: "shipping address-line1", wide: true },
  { name: "line2", label: "Area or landmark (optional)", autoComplete: "shipping address-line2", optional: true, wide: true },
  { name: "city", label: "City", autoComplete: "shipping address-level2" },
  { name: "province", label: "Province", autoComplete: "shipping address-level1" },
  { name: "postalCode", label: "Postal code (optional)", autoComplete: "shipping postal-code", optional: true },
]

/** Field order for "focus the first problem". */
const FIELD_ORDER: Field[] = ["email", ...ADDRESS_FIELDS.map((field) => field.name), "shippingCode", "paymentMethod"]

const control =
  "w-full rounded-lg border-2 border-control-border bg-background px-4 text-18 transition-colors hover:border-foreground focus-visible:border-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive"
const card = "flex flex-col gap-6 rounded-xl bg-background p-5 outline-1 outline-border-strong md:p-7.5"
const option =
  "flex cursor-pointer items-start gap-4 rounded-lg border-2 border-control-border p-4 transition-colors hover:border-foreground has-checked:border-foreground has-checked:bg-brand-tint has-disabled:cursor-not-allowed has-disabled:opacity-60 has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring md:p-5"
const radio = "mt-1 size-5 shrink-0 accent-foreground"

const fromAddress = (address: CustomerAddress, email: string): Values => ({
  email,
  fullName: address.fullName,
  phone: address.phone,
  line1: address.line1,
  line2: address.line2 ?? "",
  city: address.city,
  province: address.province,
  postalCode: address.postalCode ?? "",
})

const newKey = () => crypto.randomUUID().replaceAll("-", "")

/**
 * Checkout (derived: the design stops at the bag). One page, four short sections beside the
 * order summary: contact, delivery address, delivery option, payment. Totals are always the
 * server's: the bag is re-quoted when the city, province, delivery option or codes change, and
 * the quote holds the stock for the reservation window. The order is placed with one
 * idempotency key per visit, so a double click or a retried request can never create two orders.
 */
export function CheckoutView({ context }: { context: CheckoutContext }) {
  const id = useId()
  const hydrated = useHydrated()
  const router = useRouter()
  const quote = useCheckoutQuote()
  const place = usePlaceOrder()
  const defaultAddress = context.addresses.find((address) => address.isDefault) ?? context.addresses[0]
  const email = context.customer?.email ?? ""
  const [values, setValues] = useState<Values>(() =>
    defaultAddress
      ? fromAddress(defaultAddress, email)
      : { email, fullName: context.customer?.fullName ?? "", phone: context.customer?.phone ?? "", line1: "", line2: "", city: "", province: "", postalCode: "" },
  )
  const [savedAddress, setSavedAddress] = useState<string>(defaultAddress?.id ?? "new")
  const [data, setData] = useState<QuoteResponse | null>(null)
  const [shippingCode, setShippingCode] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const idempotencyKey = useRef(newKey())
  const latest = useRef(0)
  const quoted = useRef({ city: "", province: "" })

  const { mutate: runQuote } = quote
  const requote = useCallback(
    (next: { city?: string; province?: string; shippingCode?: string }) => {
      const ticket = ++latest.current
      runQuote(
        { city: next.city || undefined, province: next.province || undefined, shippingCode: next.shippingCode || undefined },
        {
          onSuccess: (response) => {
            if (ticket !== latest.current) return
            setData(response)
            setShippingCode((current) => (response.shippingQuotes.some((rate) => rate.code === current) ? current : (response.shippingQuotes[0]?.code ?? "")))
          },
          onError: (failure) => ticket === latest.current && setFormError(failure instanceof ApiError ? failure.message : "We couldn't update your totals. Please try again."),
        },
      )
    },
    [runQuote],
  )

  /** First quote, for the prefilled address; later quotes follow the shopper's edits. */
  const initialAddress = useRef({ city: values.city, province: values.province })
  useEffect(() => {
    quoted.current = initialAddress.current
    requote(initialAddress.current)
  }, [requote])

  /** Re-quote only when the parts of the address that pick a zone or tax rate actually changed. */
  function requoteForAddress(next: Values) {
    if (next.city.trim() === quoted.current.city.trim() && next.province === quoted.current.province) return
    quoted.current = { city: next.city, province: next.province }
    requote({ city: next.city, province: next.province, shippingCode })
  }

  const set = (name: keyof Values, value: string) => {
    setValues((current) => ({ ...current, [name]: value }))
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }))
  }

  function chooseSaved(addressId: string) {
    setSavedAddress(addressId)
    const address = context.addresses.find((item) => item.id === addressId)
    const next = address ? fromAddress(address, values.email) : { ...values, fullName: "", phone: "", line1: "", line2: "", city: "", province: "", postalCode: "" }
    setValues(next)
    setErrors({})
    requoteForAddress(next)
  }

  const cart = data?.cart
  const selectedRate = data?.shippingQuotes.find((rate) => rate.code === shippingCode)
  const codUnavailable = selectedRate ? !selectedRate.cashOnDelivery : false
  const blocked = !cart || cart.lines.length === 0 || cart.warnings.length > 0 || cart.lines.some((line) => !line.available)
  const busy = !hydrated || place.isPending || place.isSuccess

  /** A cash-on-delivery choice lapses when the delivery option changes to a prepaid-only one. */
  const chosenPayment = codUnavailable && paymentMethod === "cod" ? "" : paymentMethod

  function focusFirst(form: HTMLFormElement, found: Partial<Record<Field, string>>) {
    const first = [...FIELD_ORDER, ...context.orderFields.map((field) => field.code)].find((name) => found[name])
    if (first) form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || blocked) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const customFields: Record<string, string | boolean> = {}
    for (const field of context.orderFields) {
      customFields[field.code] = field.type === "boolean" ? formData.get(field.code) === "on" : String(formData.get(field.code) ?? "")
    }
    const { email: emailValue, ...address } = values
    const parsed = checkoutSchema.safeParse({
      email: emailValue,
      address,
      shippingCode,
      paymentMethod: chosenPayment,
      note: String(formData.get("note") ?? "") || undefined,
      customFields,
      saveAddress: formData.get("saveAddress") === "on",
    })
    if (!parsed.success) {
      const found: Partial<Record<Field, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = (issue.path[0] === "address" ? issue.path[1] : issue.path[0]) as Field
        found[key] ??= issue.message
      }
      setErrors(found)
      setFormError("Please check the highlighted fields.")
      focusFirst(form, found)
      return
    }
    setErrors({})
    setFormError(null)
    place.mutate(
      { input: parsed.data, idempotencyKey: idempotencyKey.current },
      {
        onSuccess: ({ order, accessToken, next }) => {
          if (next.type === "redirect") window.location.assign(next.url)
          else router.replace(`/orders/${order.number}?token=${encodeURIComponent(accessToken)}&placed=1`)
        },
        onError: (failure) => {
          if (!(failure instanceof ApiError)) {
            setFormError("Something went wrong. Please try again.")
            return
          }
          // A field-specific refusal (custom field, delivery option) points at the field.
          const field = typeof failure.details?.field === "string" ? failure.details.field : null
          if (field) {
            setErrors({ [field]: failure.message })
            focusFirst(form, { [field]: failure.message })
          }
          setFormError(failure.message)
          // Stock or prices may have moved: show the shopper exactly what changed.
          if (failure.status !== 0) requote({ city: values.city, province: values.province, shippingCode })
        },
      },
    )
  }

  if (data && cart && cart.lines.length === 0) {
    return (
      <Container className="flex flex-col items-center gap-6 py-24 text-center">
        <h1 className="text-34 font-bold md:text-54">Your bag is empty</h1>
        <p className="text-18 text-subtle-foreground md:text-20">Add a pair to your bag to check out.</p>
        <Link href="/" className="flex h-14 items-center rounded-xl bg-foreground px-8 text-20 font-semibold text-background hover:bg-brand hover:text-brand-foreground">
          Continue shopping
        </Link>
      </Container>
    )
  }

  const errorText = (name: Field) =>
    errors[name] ? (
      <p id={`${id}-${name}-error`} className="text-16 font-medium text-destructive">
        {errors[name]}
      </p>
    ) : null
  const described = (name: Field) => ({ "aria-invalid": errors[name] ? true : undefined, "aria-describedby": errors[name] ? `${id}-${name}-error` : undefined })
  const price = (amount: number) => formatPrice(amount, cart?.currency ?? "PKR", { symbol: true })

  return (
    <div className="bg-surface">
      <Container className="flex flex-col gap-8 pt-8 pb-16 md:pt-14 md:pb-24 3xl:px-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-34 font-bold tracking-tight-2 md:text-54">Checkout</h1>
          <Link href="/cart" className="min-h-11 content-center text-18 font-semibold underline-offset-4 hover:underline md:text-20">
            Back to bag
          </Link>
        </div>

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-cart lg:gap-5">
          {/* The summary holds its own promotion-code form, so it sits beside this form, not inside it; Place order submits this one by id. */}
          <form id={`${id}-form`} method="post" inert={!hydrated} noValidate onSubmit={onSubmit} aria-busy={busy} aria-label="Checkout details" className="flex min-w-0 flex-col gap-5">
            <Section title="Contact" number={1}>
              {context.customer ? (
                <p className="text-18 md:text-20">
                  Signed in as <strong className="font-semibold">{context.customer.email}</strong>. We&rsquo;ll send your order updates there.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <label htmlFor={`${id}-email`} className="text-18 font-bold md:text-20">
                    Email
                  </label>
                  <input
                    id={`${id}-email`}
                    name="email"
                    type="email"
                    disabled={!hydrated}
                    autoComplete="email"
                    value={values.email}
                    onChange={(event) => set("email", event.target.value)}
                    {...described("email")}
                    className={cn(control, "h-14")}
                  />
                  {errorText("email")}
                  <p className="text-16 text-subtle-foreground">
                    For your receipt and delivery updates.{" "}
                    <Link href="/account/login?next=/checkout" className="font-semibold text-foreground underline underline-offset-4">
                      Sign in
                    </Link>{" "}
                    to use saved addresses.
                  </p>
                </div>
              )}
            </Section>

            <Section title="Delivery address" number={2}>
              {context.addresses.length > 0 ? (
                <fieldset className="flex flex-col gap-3">
                  <legend className="pb-3 text-18 font-bold md:text-20">Saved addresses</legend>
                  {context.addresses.map((address) => (
                    <label key={address.id} className={option}>
                      <input type="radio" name="savedAddress" value={address.id} checked={savedAddress === address.id} onChange={() => chooseSaved(address.id)} className={radio} />
                      <span className="flex flex-col gap-1 text-16 md:text-18">
                        <span className="font-semibold">{address.fullName}</span>
                        <span className="text-subtle-foreground">
                          {[address.line1, address.line2, address.city, address.province].filter(Boolean).join(", ")}
                        </span>
                      </span>
                    </label>
                  ))}
                  <label className={option}>
                    <input type="radio" name="savedAddress" value="new" checked={savedAddress === "new"} onChange={() => chooseSaved("new")} className={radio} />
                    <span className="text-16 font-semibold md:text-18">A new address</span>
                  </label>
                </fieldset>
              ) : null}

              <div className="grid gap-5 sm:grid-cols-2">
                {ADDRESS_FIELDS.map((field) => (
                  <div key={field.name} className={cn("flex flex-col gap-2.5", field.wide && "sm:col-span-2")}>
                    <label htmlFor={`${id}-${field.name}`} className="text-18 font-bold md:text-20">
                      {field.label}
                    </label>
                    {field.name === "province" ? (
                      <select
                        id={`${id}-province`}
                        name="province"
                        disabled={!hydrated}
                        autoComplete={field.autoComplete}
                        value={values.province}
                        onChange={(event) => {
                          const next = { ...values, province: event.target.value }
                          set("province", event.target.value)
                          requoteForAddress(next)
                        }}
                        {...described("province")}
                        className={cn(control, "h-14 appearance-auto")}
                      >
                        <option value="">Choose…</option>
                        {PROVINCES.map((province) => (
                          <option key={province}>{province}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`${id}-${field.name}`}
                        name={field.name}
                        disabled={!hydrated}
                        type={field.type ?? "text"}
                        inputMode={field.name === "postalCode" ? "numeric" : undefined}
                        autoComplete={field.autoComplete}
                        value={values[field.name]}
                        onChange={(event) => set(field.name, event.target.value)}
                        onBlur={field.name === "city" ? () => requoteForAddress(values) : undefined}
                        {...described(field.name)}
                        className={cn(control, "h-14")}
                      />
                    )}
                    {errorText(field.name)}
                  </div>
                ))}
              </div>
              {context.customer && savedAddress === "new" ? (
                <label className="flex min-h-11 items-center gap-3 text-16 font-medium md:text-18">
                  <input type="checkbox" name="saveAddress" className="size-5 accent-foreground" />
                  Save this address to my account
                </label>
              ) : null}
            </Section>

            <Section title="Delivery" number={3}>
              <fieldset className="flex flex-col gap-3" aria-describedby={errors.shippingCode ? `${id}-shippingCode-error` : undefined}>
                <legend className="sr-only">Delivery option</legend>
                {!data ? (
                  <p className="text-16 text-subtle-foreground md:text-18">Loading delivery options…</p>
                ) : data.shippingQuotes.length === 0 ? (
                  <p className="text-16 font-medium text-destructive md:text-18">We don&rsquo;t deliver to this address yet. Please check the city, or contact us.</p>
                ) : (
                  data.shippingQuotes.map((rate) => (
                    <label key={rate.code} className={option}>
                      <input
                        type="radio"
                        name="shippingCode"
                        value={rate.code}
                        checked={shippingCode === rate.code}
                        onChange={() => {
                          setShippingCode(rate.code)
                          requote({ city: values.city, province: values.province, shippingCode: rate.code })
                        }}
                        className={radio}
                      />
                      <span className="flex flex-1 flex-col gap-1 text-16 md:text-18">
                        <span className="font-semibold">{rate.label}</span>
                        <span className="text-subtle-foreground">
                          {rate.minDays === rate.maxDays ? `${rate.minDays} working day` : `${rate.minDays}–${rate.maxDays} working days`}
                          {rate.cashOnDelivery ? "" : " · prepaid only"}
                        </span>
                      </span>
                      <span className="text-16 font-semibold md:text-18">{rate.free ? "Free" : price(rate.effectiveAmount)}</span>
                    </label>
                  ))
                )}
                {errorText("shippingCode")}
              </fieldset>

              {context.orderFields.map((field) => (
                <div key={field.code} className="flex flex-col gap-2.5">
                  {field.type === "boolean" ? (
                    <label className="flex min-h-11 items-center gap-3 text-16 font-medium md:text-18">
                      <input type="checkbox" name={field.code} className="size-5 accent-foreground" />
                      {field.label}
                    </label>
                  ) : (
                    <>
                      <label htmlFor={`${id}-${field.code}`} className="text-18 font-bold md:text-20">
                        {field.label}
                        {field.required ? "" : " (optional)"}
                      </label>
                      <input
                        id={`${id}-${field.code}`}
                        name={field.code}
                        type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "url" ? "url" : "text"}
                        maxLength={field.type === "text" ? 500 : undefined}
                        required={field.required}
                        {...described(field.code)}
                        className={cn(control, "h-14")}
                      />
                    </>
                  )}
                  {errorText(field.code)}
                </div>
              ))}
              <div className="flex flex-col gap-2.5">
                <label htmlFor={`${id}-note`} className="text-18 font-bold md:text-20">
                  Delivery instructions (optional)
                </label>
                <textarea id={`${id}-note`} name="note" rows={3} maxLength={500} className={cn(control, "resize-y py-3")} />
              </div>
            </Section>

            <Section title="Payment" number={4}>
              <fieldset className="flex flex-col gap-3" aria-describedby={errors.paymentMethod ? `${id}-paymentMethod-error` : undefined}>
                <legend className="sr-only">Payment method</legend>
                {(data?.paymentMethods ?? []).map((method) => {
                  const disabled = method.code === "cod" && codUnavailable
                  return (
                    <label key={method.code} className={option}>
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={method.code}
                        checked={chosenPayment === method.code}
                        disabled={disabled}
                        onChange={() => {
                          setPaymentMethod(method.code)
                          setErrors((current) => ({ ...current, paymentMethod: undefined }))
                        }}
                        className={radio}
                      />
                      <span className="flex flex-col gap-1 text-16 md:text-18">
                        <span className="font-semibold">{method.label}</span>
                        <span className="text-subtle-foreground">{disabled ? "Not available with this delivery option." : method.description}</span>
                      </span>
                    </label>
                  )
                })}
                {errorText("paymentMethod")}
              </fieldset>
            </Section>
          </form>

          {cart ? (
            <CheckoutSummary cart={cart} codeForm={<PromoCodeForm cart={cart} onChange={() => requote({ city: values.city, province: values.province, shippingCode })} />}>
              {cart.warnings.length > 0 ? (
                <div role="alert" className="mt-6 flex flex-col gap-1 rounded-lg border-2 border-destructive px-4 py-3 text-16 font-medium text-destructive">
                  {cart.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                  <Link href="/cart" className="font-semibold underline underline-offset-4">
                    Review your bag
                  </Link>
                </div>
              ) : null}
              <div className="flex flex-col gap-3 pt-8">
                <button
                  type="submit"
                  form={`${id}-form`}
                  disabled={busy || blocked}
                  className="flex h-14 items-center justify-center rounded-lg bg-foreground text-20 font-semibold text-background transition-colors hover:bg-brand hover:text-brand-foreground disabled:cursor-not-allowed disabled:opacity-50 md:h-16 md:text-24"
                >
                  {busy ? "Placing order…" : `Place order · ${price(cart.totals.total)}`}
                </button>
                <p role="alert" className="text-16 font-medium text-destructive empty:hidden">
                  {formError}
                </p>
                <p className="text-14 text-subtle-foreground md:text-16">
                  By placing your order you agree to our{" "}
                  <Link href="/terms" className="underline underline-offset-4">
                    terms
                  </Link>{" "}
                  and{" "}
                  <Link href="/returns" className="underline underline-offset-4">
                    returns policy
                  </Link>
                  .{data?.holdExpiresAt ? ` We're holding these pairs for you until ${new Date(data.holdExpiresAt).toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" })}.` : ""}
                </p>
              </div>
            </CheckoutSummary>
          ) : (
            <p role="status" className="rounded-2xl bg-background p-7.5 text-18 text-subtle-foreground outline-1 outline-foreground">
              Loading your order summary…
            </p>
          )}
        </div>
      </Container>
    </div>
  )
}

function Section({ title, number, children }: { title: string; number: number; children: ReactNode }) {
  return (
    <section aria-labelledby={`checkout-step-${number}`} className={card}>
      <h2 id={`checkout-step-${number}`} className="flex items-center gap-3 text-24 font-bold md:text-28">
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-brand text-18 text-brand-foreground">
          {number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}
