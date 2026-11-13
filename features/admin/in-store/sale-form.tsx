"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, type FormEvent } from "react"

import { formatPrice } from "@/lib/format"

type ProductRow = { variantId: string; productId: string; brand: string; title: string; kind: string; condition: string | null; conditionNotes: string | null; sku: string; eu: string; uk: string; available: number; unitPrice: number }
type BasketLine = ProductRow & { quantity: number }
type Quote = { lines: { variantId: string; brand: string; title: string; kind: string; condition: string | null; conditionNotes: string | null; size: { eu: string }; quantity: number; unitPrice: number }[]; subtotal: number; discount: number; tax: number; taxIncluded: boolean; taxLabel: string | null; total: number; change: number; fingerprint: string }

function minorUnits(value: string): number | null {
  const clean = value.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  const [major, fraction = ""] = clean.split(".")
  const result = Number(major) * 100 + Number(fraction.padEnd(2, "0"))
  return Number.isSafeInteger(result) ? result : null
}

function errorMessage(payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: string } }).error
    if (error?.message) return error.message
  }
  return "The sale could not be completed. Please try again."
}

export function SaleForm({ initialProducts }: { initialProducts: ProductRow[] }) {
  const router = useRouter()
  const key = useRef<string | null>(null)
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState<"new" | "preloved">("new")
  const [products, setProducts] = useState<ProductRow[]>(initialProducts)
  const [basket, setBasket] = useState<BasketLine[]>([])
  const [discount, setDiscount] = useState("0")
  const [tendered, setTendered] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [shopAddress, setShopAddress] = useState("")
  const [province, setProvince] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer">("cash")
  const [paymentReference, setPaymentReference] = useState("")
  const [policyShown, setPolicyShown] = useState(false)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState("")

  async function search(nextKind = kind) {
    setSearching(true)
    setError("")
    try {
      const response = await fetch(`/api/admin/in-store/products?kind=${nextKind}&q=${encodeURIComponent(query)}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(errorMessage(body))
      setProducts(body.products)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not search products.") }
    finally { setSearching(false) }
  }

  function add(row: ProductRow) {
    setQuote(null)
    setBasket((current) => {
      const existing = current.find((item) => item.variantId === row.variantId)
      if (existing) return current.map((item) => item.variantId === row.variantId ? { ...item, quantity: Math.min(row.available, item.quantity + 1) } : item)
      return [...current, { ...row, quantity: 1 }]
    })
  }

  function quantity(id: string, count: number) {
    setQuote(null)
    setBasket((current) => count < 1 ? current.filter((line) => line.variantId !== id) : current.map((line) => line.variantId === id ? { ...line, quantity: Math.min(line.available, count) } : line))
  }

  function salePayload() {
    const discountMinor = minorUnits(discount)
    const tenderedMinor = paymentMethod === "cash" ? minorUnits(tendered) : 0
    if (discountMinor === null || tenderedMinor === null) throw new Error("Enter valid rupee amounts with no more than two decimal places.")
    if (!basket.length) throw new Error("Add at least one pair to the sale.")
    key.current ??= crypto.randomUUID()
    return { items: basket.map(({ variantId, quantity }) => ({ variantId, quantity })), discountMinor,
      tenderedMinor, customerName, customerEmail, customerPhone, shopAddress, province, policyShown,
      paymentMethod, paymentReference, idempotencyKey: key.current }
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setBusy(true)
    try {
      const response = await fetch("/api/admin/in-store/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(salePayload()) })
      const body = await response.json()
      if (!response.ok) throw new Error(errorMessage(body))
      setQuote(body)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not review this sale.") }
    finally { setBusy(false) }
  }

  async function complete() {
    if (!quote || busy) return
    setError("")
    setBusy(true)
    try {
      if (!policyShown) throw new Error("Show the return policy to the customer before completing the sale.")
      const response = await fetch("/api/admin/in-store", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...salePayload(), expectedTotalMinor: quote.total, expectedQuote: quote.fingerprint }) })
      const body = await response.json()
      if (!response.ok) throw new Error(errorMessage(body))
      router.push(`/admin/in-store/${encodeURIComponent(body.number)}/receipt`)
      router.refresh()
    } catch (cause) { setQuote(null); setError(cause instanceof Error ? cause.message : "Could not record this sale.") }
    finally { setBusy(false) }
  }

  const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-14 outline-none focus:border-foreground"
  const label = "flex flex-col gap-1 text-14 font-semibold"
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
    <section className="rounded-lg border border-border bg-background p-5" aria-labelledby="shop-products">
      <h2 id="shop-products" className="mb-3 text-20 font-semibold">Find a pair</h2>
      <div className="mb-3 flex gap-2" role="group" aria-label="Product condition">
        {(["new", "preloved"] as const).map((value) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); void search(value) }} className={`rounded-md px-3 py-2 text-14 font-semibold ${kind === value ? "bg-brand text-brand-foreground" : "border border-border"}`}>{value === "new" ? "Brand New" : "Pre-Loved"}</button>)}
      </div>
      <div className="mb-4 flex gap-2"><input className={field} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search() } }} placeholder="Search product, brand or SKU" aria-label="Search products" /><button type="button" disabled={searching} onClick={() => void search()} className="rounded-md bg-foreground px-4 text-14 font-semibold text-background disabled:opacity-50">Search</button></div>
      <div className="max-h-96 divide-y divide-border overflow-y-auto">
        {products.length ? products.map((row) => <div key={row.variantId} className="flex items-center justify-between gap-3 py-3 text-14">
          <div><strong className="block">{row.brand} {row.title}</strong><span className="text-subtle-foreground">EU {row.eu} · UK {row.uk} · {row.sku}{row.condition ? ` · ${row.condition.replaceAll("-", " ")}` : ""}</span><span className="block">{formatPrice(row.unitPrice, "PKR")} · {row.available} available</span>{row.kind === "preloved" && row.conditionNotes ? <span className="block text-subtle-foreground">Condition: {row.conditionNotes}</span> : null}</div>
          <button type="button" onClick={() => add(row)} disabled={basket.find((line) => line.variantId === row.variantId)?.quantity === row.available} className="shrink-0 rounded-md border border-foreground px-3 py-2 font-semibold disabled:opacity-40">Add</button>
        </div>) : <p className="py-6 text-14 text-subtle-foreground">No available sizes match. Try another search.</p>}
      </div>
    </section>
    <form method="post" onSubmit={(event) => void review(event)} className="rounded-lg border border-border bg-background p-5">
      <h2 className="mb-3 text-20 font-semibold">Sale details</h2>
      <div className="mb-5 space-y-3">{basket.length ? basket.map((line) => <div key={line.variantId} className="flex items-start justify-between gap-2 border-b border-border pb-3 text-14">
        <div><strong className="block">{line.brand} {line.title}</strong><span>{line.kind === "new" ? "Brand New" : `Pre-Loved · ${line.condition?.replaceAll("-", " ") ?? "condition listed"}`} · EU {line.eu}</span><span className="block text-subtle-foreground">{formatPrice(line.unitPrice, "PKR")} each</span>{line.kind === "preloved" && line.conditionNotes ? <span className="block text-subtle-foreground">Condition: {line.conditionNotes}</span> : null}</div>
        <div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => quantity(line.variantId, line.quantity - 1)} aria-label={`Remove one ${line.title}`} className="rounded border px-2">−</button><span className="min-w-5 text-center">{line.quantity}</span><button type="button" onClick={() => quantity(line.variantId, line.quantity + 1)} disabled={line.quantity >= line.available} aria-label={`Add one ${line.title}`} className="rounded border px-2 disabled:opacity-40">+</button></div>
      </div>) : <p className="text-14 text-subtle-foreground">Choose a pair from the left.</p>}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Customer name (optional)<input className={field} value={customerName} onChange={(event) => { setCustomerName(event.target.value); setQuote(null) }} maxLength={190} /></label>
        <label className={label}>Phone (optional)<input className={field} value={customerPhone} onChange={(event) => { setCustomerPhone(event.target.value); setQuote(null) }} maxLength={40} inputMode="tel" /></label>
        <label className={label}>Email (optional)<input className={field} value={customerEmail} onChange={(event) => { setCustomerEmail(event.target.value); setQuote(null) }} maxLength={254} type="email" /></label>
        <label className={`${label} sm:col-span-2`}>Shop address printed on receipt<textarea className={field} value={shopAddress} onChange={(event) => { setShopAddress(event.target.value); setQuote(null) }} maxLength={300} rows={2} required placeholder="Enter your actual shop address" /></label>
        <label className={label}>Shop province for tax (optional)<input className={field} value={province} onChange={(event) => { setProvince(event.target.value); setQuote(null) }} maxLength={80} placeholder="e.g. Punjab" /></label>
        <label className={label}>Discount (Rs.)<input className={field} value={discount} onChange={(event) => { setDiscount(event.target.value); setQuote(null) }} inputMode="decimal" /></label>
        <label className={label}>Payment collected<select className={field} value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value as "cash" | "bank_transfer"); setQuote(null) }}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option></select></label>
        {paymentMethod === "cash" ? <label className={label}>Cash received (Rs.)<input className={field} value={tendered} onChange={(event) => { setTendered(event.target.value); setQuote(null) }} inputMode="decimal" required /></label> : <label className={label}>Confirmed transfer reference<input className={field} value={paymentReference} onChange={(event) => { setPaymentReference(event.target.value); setQuote(null) }} maxLength={190} required /></label>}
      </div>
      <p className="mt-3 text-12 text-subtle-foreground">Only record a sale after receiving payment and handing the shoes to the customer. The final total comes from the current product prices and tax settings.</p>
      <label className="mt-3 flex items-start gap-2 text-14"><input type="checkbox" checked={policyShown} onChange={(event) => { setPolicyShown(event.target.checked); setQuote(null) }} className="mt-1" required /><span>I showed the customer the <a href="/returns" target="_blank" rel="noopener" className="underline">returns and refunds policy</a> before taking payment.</span></label>
      {error ? <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-14 text-red-700">{error}</p> : null}
      <button type="submit" disabled={busy || basket.length === 0} className="mt-4 w-full rounded-md border border-foreground px-4 py-3 text-14 font-semibold disabled:opacity-40">{busy && !quote ? "Checking…" : "Review total"}</button>
      {quote ? <div className="mt-4 rounded-md border-2 border-foreground p-4 text-14" aria-live="polite">
        <h3 className="mb-2 font-semibold">Confirm this sale</h3>
        <div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(quote.subtotal, "PKR")}</span></div>
        {quote.discount ? <div className="flex justify-between"><span>Discount</span><span>− {formatPrice(quote.discount, "PKR")}</span></div> : null}
        {quote.tax ? <div className="flex justify-between"><span>{quote.taxLabel ?? "Tax"} {quote.taxIncluded ? "(included)" : ""}</span><span>{formatPrice(quote.tax, "PKR")}</span></div> : null}
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-18 font-bold"><span>Total to collect</span><span>{formatPrice(quote.total, "PKR")}</span></div>
        {paymentMethod === "cash" ? <div className="flex justify-between"><span>Change to give</span><span>{formatPrice(quote.change, "PKR")}</span></div> : null}
        <div className="mt-4 rounded-md border border-border bg-surface p-4 text-12">
          <h4 className="mb-2 text-center font-bold tracking-wide">Receipt preview</h4>
          <p className="text-center font-semibold">SOLEDROP · In-store purchase</p>
          <p className="mb-3 text-center text-subtle-foreground">Order number and date appear after the sale is recorded.</p>
          <p><strong>Shop:</strong> {shopAddress}</p>
          <p><strong>Customer:</strong> {customerName || "Walk-in customer"}</p>
          <div className="my-3 border-t border-dashed border-border-strong" />
          {quote.lines.map((line) => <div key={line.variantId} className="mb-2">
            <p className="font-semibold">{line.brand} {line.title}</p>
            <p>{line.kind === "new" ? "Brand New" : `Pre-Loved · ${line.condition?.replaceAll("-", " ") ?? "Graded"}`} · EU {line.size.eu} · {line.quantity} × {formatPrice(line.unitPrice, "PKR")}</p>
            {line.kind === "preloved" && line.conditionNotes ? <p className="text-subtle-foreground">Condition: {line.conditionNotes}</p> : null}
          </div>)}
          <div className="my-3 border-t border-dashed border-border-strong" />
          <p className="flex justify-between font-bold"><span>Total</span><span>{formatPrice(quote.total, "PKR")}</span></p>
          <p>Payment: {paymentMethod === "cash" ? "Cash" : "Bank transfer"}</p>
          <p className="mt-3">Eligible preference returns: contact us within 7 calendar days of receiving the pair. Brand New shoes must have no outdoor wear and retain supplied tags, accessories and packaging. Pre-Loved shoes must remain materially unchanged with the SOLEDROP tag and included parts attached. Faulty or misdescribed items are reviewed separately. Full policy: soledrop.store/returns</p>
        </div>
        <button type="button" onClick={() => void complete()} disabled={busy} className="mt-4 w-full rounded-md bg-brand px-4 py-3 font-semibold text-brand-foreground disabled:opacity-50">{busy ? "Recording…" : "Record payment & print receipt"}</button>
      </div> : null}
    </form>
  </div>
}
