"use client"

import { Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { ApiError, request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { adminControl, AdminField, FormAlert } from "@/components/admin/form"
import { taxTableInput, zoneInput } from "@/features/admin/shipping/schema"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ShippingQuote, ShippingZone, TaxRate } from "@/server/shipping/types"

const message = (failure: unknown) => (failure instanceof ApiError ? failure.message : "Something went wrong. Please try again.")
const rupees = (minor: number | null) => (minor === null ? "" : String(minor / 100))
const minor = (value: string) => Math.max(0, Math.round(Number(value || 0) * 100))
const list = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
const cell = cn(adminControl, "h-9 px-2")

function ZoneForm({ zone, canWrite, onSaved }: { zone: ShippingZone | null; canWrite: boolean; onSaved: () => void }) {
  const id = useId()
  const [form, setForm] = useState<ShippingZone>(zone ?? { id: "", name: "", countries: ["PK"], cities: [], position: 99, rates: [{ code: "standard", label: "Standard delivery", amount: 25_000, freeOver: null, minDays: 2, maxDays: 5, cashOnDelivery: true }] })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const setRate = (index: number, changes: Partial<ShippingZone["rates"][number]>) => setForm({ ...form, rates: form.rates.map((rate, at) => (at === index ? { ...rate, ...changes } : rate)) })

  async function save() {
    const parsed = zoneInput.safeParse(form)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Please check the zone.")
    setBusy(true)
    setError(null)
    try {
      await request(zone ? `/api/admin/shipping/zones/${zone.id}` : "/api/admin/shipping/zones", { method: zone ? "PUT" : "POST", body: parsed.data })
      onSaved()
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!zone) return
    setBusy(true)
    try {
      await request(`/api/admin/shipping/zones/${zone.id}`, { method: "DELETE" })
      onSaved()
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminCard title={zone ? zone.name : "New zone"}>
      <fieldset disabled={!canWrite} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <AdminField formId={id} name="name" label="Zone name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <AdminField formId={id} name="countries" label="Countries (codes)" hint="PK, AE…" value={form.countries.join(", ")} onChange={(event) => setForm({ ...form, countries: list(event.target.value.toUpperCase()) })} />
          <AdminField formId={id} name="position" label="Order (lower first)" type="number" value={form.position} onChange={(event) => setForm({ ...form, position: Number(event.target.value) || 0 })} />
        </div>
        <AdminField formId={id} name="cities" label="Only these cities (optional)" hint="Comma-separated. Empty: the whole country. A city zone wins over a country zone." value={form.cities.join(", ")} onChange={(event) => setForm({ ...form, cities: list(event.target.value) })} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse text-14">
            <thead className="text-subtle-foreground">
              <tr>
                {["Code", "Name shoppers see", "Price (Rs.)", "Free over (Rs.)", "Days", "COD", ""].map((label) => (
                  <th key={label} scope="col" className="h-9 px-1 text-start font-semibold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {form.rates.map((rate, index) => (
                <tr key={index} className="border-t border-border">
                  <td className="px-1 py-1.5">
                    <input aria-label={`Code, option ${index + 1}`} value={rate.code} onChange={(event) => setRate(index, { code: event.target.value })} className={cn(cell, "w-28")} />
                  </td>
                  <td className="px-1 py-1.5">
                    <input aria-label={`Name, option ${index + 1}`} value={rate.label} onChange={(event) => setRate(index, { label: event.target.value })} className={cn(cell, "w-48")} />
                  </td>
                  <td className="px-1 py-1.5">
                    <input aria-label={`Price, option ${index + 1}`} inputMode="decimal" value={rupees(rate.amount)} onChange={(event) => setRate(index, { amount: minor(event.target.value) })} className={cn(cell, "w-24")} />
                  </td>
                  <td className="px-1 py-1.5">
                    <input aria-label={`Free over, option ${index + 1}`} inputMode="decimal" value={rupees(rate.freeOver)} onChange={(event) => setRate(index, { freeOver: event.target.value ? minor(event.target.value) : null })} className={cn(cell, "w-28")} />
                  </td>
                  <td className="px-1 py-1.5">
                    <span className="flex items-center gap-1">
                      <input aria-label={`Quickest days, option ${index + 1}`} type="number" min={0} value={rate.minDays} onChange={(event) => setRate(index, { minDays: Number(event.target.value) || 0 })} className={cn(cell, "w-16")} />–
                      <input aria-label={`Slowest days, option ${index + 1}`} type="number" min={0} value={rate.maxDays} onChange={(event) => setRate(index, { maxDays: Number(event.target.value) || 0 })} className={cn(cell, "w-16")} />
                    </span>
                  </td>
                  <td className="px-1 py-1.5">
                    <input aria-label={`Cash on delivery, option ${index + 1}`} type="checkbox" checked={rate.cashOnDelivery} onChange={(event) => setRate(index, { cashOnDelivery: event.target.checked })} className="size-4 accent-foreground" />
                  </td>
                  <td className="px-1 py-1.5">
                    {form.rates.length > 1 ? (
                      <button type="button" aria-label={`Remove option ${index + 1}`} onClick={() => setForm({ ...form, rates: form.rates.filter((_, at) => at !== index) })} className={adminButton({ tone: "ghost", size: "icon" })}>
                        <Trash2 />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <FormAlert>{error}</FormAlert>
        {canWrite ? (
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => setForm({ ...form, rates: [...form.rates, { code: `option-${form.rates.length + 1}`, label: "Express delivery", amount: 50_000, freeOver: null, minDays: 1, maxDays: 2, cashOnDelivery: false }] })} className={adminButton({ tone: "secondary", size: "sm" })}>
              <Plus aria-hidden /> Add delivery option
            </button>
            <div className="flex gap-2">
              {zone ? (
                <button type="button" disabled={busy} onClick={() => void remove()} className={adminButton({ tone: "ghost", size: "sm" })}>
                  Delete zone
                </button>
              ) : null}
              <button type="button" disabled={busy} onClick={() => void save()} className={adminButton({ tone: "primary", size: "sm" })}>
                {busy ? "Saving…" : "Save zone"}
              </button>
            </div>
          </div>
        ) : null}
      </fieldset>
    </AdminCard>
  )
}

function TaxTable({ rates: initial, canWrite, onSaved }: { rates: TaxRate[]; canWrite: boolean; onSaved: () => void }) {
  const [rates, setRates] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const setRate = (index: number, changes: Partial<TaxRate>) => setRates(rates.map((rate, at) => (at === index ? { ...rate, ...changes } : rate)))
  async function save() {
    const parsed = taxTableInput.safeParse({ rates })
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Please check the tax table.")
    setBusy(true)
    setError(null)
    try {
      await request("/api/admin/shipping/tax", { method: "PUT", body: parsed.data })
      onSaved()
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AdminCard title="Tax" description="Prices in Pakistan include tax; the figure is worked out for the invoice. A province rate wins over the country rate.">
      <fieldset disabled={!canWrite} className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {rates.map((rate, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2 text-14">
              <input aria-label={`Country, rate ${index + 1}`} value={rate.country} maxLength={2} onChange={(event) => setRate(index, { country: event.target.value.toUpperCase() })} className={cn(cell, "w-16")} />
              <input aria-label={`Province, rate ${index + 1}`} placeholder="All provinces" value={rate.province ?? ""} onChange={(event) => setRate(index, { province: event.target.value || null })} className={cn(cell, "w-48")} />
              <input aria-label={`Label, rate ${index + 1}`} value={rate.label} onChange={(event) => setRate(index, { label: event.target.value })} className={cn(cell, "w-40")} />
              <span className="flex items-center gap-1">
                <input aria-label={`Percent, rate ${index + 1}`} type="number" step="0.01" min={0} max={100} value={rate.basisPoints / 100} onChange={(event) => setRate(index, { basisPoints: Math.round(Number(event.target.value) * 100) })} className={cn(cell, "w-20")} />%
              </span>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={rate.inclusive} onChange={(event) => setRate(index, { inclusive: event.target.checked })} className="size-4 accent-foreground" /> Included in prices
              </label>
              <button type="button" aria-label={`Remove rate ${index + 1}`} onClick={() => setRates(rates.filter((_, at) => at !== index))} className={adminButton({ tone: "ghost", size: "icon" })}>
                <Trash2 />
              </button>
            </li>
          ))}
        </ul>
        <FormAlert>{error}</FormAlert>
        {canWrite ? (
          <div className="flex justify-between gap-2">
            <button type="button" onClick={() => setRates([...rates, { country: "PK", province: null, label: "Sales tax", basisPoints: 1800, inclusive: true }])} className={adminButton({ tone: "secondary", size: "sm" })}>
              <Plus aria-hidden /> Add rate
            </button>
            <button type="button" disabled={busy} onClick={() => void save()} className={adminButton({ tone: "primary", size: "sm" })}>
              {busy ? "Saving…" : "Save tax table"}
            </button>
          </div>
        ) : null}
      </fieldset>
    </AdminCard>
  )
}

function Tester() {
  const [city, setCity] = useState("Lahore")
  const [province, setProvince] = useState("Punjab")
  const [subtotal, setSubtotal] = useState("14999")
  const [result, setResult] = useState<null | { zone: { name: string } | null; quotes: ShippingQuote[]; tax: { label: string | null; tax: number; inclusive: boolean } }>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <AdminCard title="Rate tester" description="What a shopper sees at checkout, using the checkout's own rules.">
      <div className="flex flex-wrap items-end gap-2 text-14">
        <label className="flex flex-col gap-1 font-bold">
          City
          <input value={city} onChange={(event) => setCity(event.target.value)} className={cn(cell, "w-36")} />
        </label>
        <label className="flex flex-col gap-1 font-bold">
          Province
          <input value={province} onChange={(event) => setProvince(event.target.value)} className={cn(cell, "w-48")} />
        </label>
        <label className="flex flex-col gap-1 font-bold">
          Bag subtotal (Rs.)
          <input inputMode="decimal" value={subtotal} onChange={(event) => setSubtotal(event.target.value)} className={cn(cell, "w-28")} />
        </label>
        <button
          type="button"
          onClick={async () => {
            setError(null)
            try {
              setResult(await request("/api/admin/shipping/test", { method: "POST", body: { country: "PK", city, province: province || undefined, subtotal: minor(subtotal) } }))
            } catch (failure) {
              setError(message(failure))
            }
          }}
          className={adminButton({ tone: "secondary", size: "sm" })}
        >
          Test
        </button>
      </div>
      <FormAlert>{error}</FormAlert>
      {result ? (
        <div role="status" className="flex flex-col gap-1 text-16">
          <p className="font-semibold">{result.zone ? `Zone: ${result.zone.name}` : "No zone covers this address: checkout can't deliver there."}</p>
          <ul className="flex flex-col gap-0.5">
            {result.quotes.map((quote) => (
              <li key={quote.code}>
                {quote.label}: {quote.free ? "Free" : formatPrice(quote.effectiveAmount)} · {quote.minDays}–{quote.maxDays} days{quote.cashOnDelivery ? " · cash on delivery" : ""}
              </li>
            ))}
          </ul>
          <p className="text-14 text-subtle-foreground">
            {result.tax.label ? `${result.tax.label}: ${formatPrice(result.tax.tax)} ${result.tax.inclusive ? "(included)" : "(added)"}` : "No tax rate applies."}
          </p>
        </div>
      ) : null}
    </AdminCard>
  )
}

/** Shipping zones and delivery options, the tax table and the tester. */
export function ShippingEditor({ zones, taxRates, canWrite }: { zones: ShippingZone[]; taxRates: TaxRate[]; canWrite: boolean }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const refresh = () => {
    setAdding(false)
    router.refresh()
  }
  return (
    <div className="flex flex-col gap-6">
      <Tester />
      {zones.map((zone) => (
        <ZoneForm key={JSON.stringify(zone)} zone={zone} canWrite={canWrite} onSaved={refresh} />
      ))}
      {adding ? <ZoneForm zone={null} canWrite={canWrite} onSaved={refresh} /> : null}
      {canWrite && !adding ? (
        <div>
          <button type="button" onClick={() => setAdding(true)} className={adminButton({ tone: "secondary" })}>
            <Plus aria-hidden /> Add zone
          </button>
        </div>
      ) : null}
      <TaxTable key={JSON.stringify(taxRates)} rates={taxRates} canWrite={canWrite} onSaved={refresh} />
    </div>
  )
}
