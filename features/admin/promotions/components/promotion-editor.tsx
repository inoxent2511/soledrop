"use client"

import { Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { ApiError, request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { adminControl, AdminField, FormAlert } from "@/components/admin/form"
import { promotionInput, type PromotionInput } from "@/features/admin/promotions/schema"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useHydrated } from "@/hooks/use-hydrated"

type Condition = PromotionInput["conditions"][number]
type Action = PromotionInput["actions"][number]

export type PromotionDraft = Omit<PromotionInput, "startsAt" | "endsAt"> & { id?: string; startsAt: string; endsAt: string; timesUsed?: number }

const CONDITIONS: { value: Condition["type"]; label: string }[] = [
  { value: "subtotal_at_least", label: "Bag subtotal at least" },
  { value: "min_quantity", label: "At least this many pairs" },
  { value: "product_kind", label: "Bag has a pair that is" },
  { value: "collection", label: "Bag has a pair from collection" },
  { value: "customer_group", label: "Customer group is" },
  { value: "first_order", label: "Customer's first order" },
]

const ACTIONS: { value: Action["type"]; label: string }[] = [
  { value: "percent_off_order", label: "% off the order" },
  { value: "fixed_off_order", label: "Amount off the order" },
  { value: "percent_off_items", label: "% off some pairs" },
  { value: "free_shipping", label: "Free delivery" },
]

const blankCondition = (type: Condition["type"]): Condition =>
  type === "subtotal_at_least" ? { type, amount: 1_000_000 } : type === "min_quantity" ? { type, quantity: 2 } : type === "product_kind" ? { type, kind: "preloved" } : type === "collection" ? { type, slugs: [] } : type === "customer_group" ? { type, groups: ["retail"] } : { type }

const blankAction = (type: Action["type"]): Action =>
  type === "percent_off_order" ? { type, basisPoints: 1000 } : type === "fixed_off_order" ? { type, amount: 50_000 } : type === "percent_off_items" ? { type, basisPoints: 1000 } : { type }

const rupees = (minor: number) => String(minor / 100)
const toMinor = (value: string) => Math.max(0, Math.round(Number(value || 0) * 100))
const message = (failure: unknown) => (failure instanceof ApiError ? failure.message : "Something went wrong. Please try again.")
/** datetime-local value (Pakistan time) ↔ ISO. */
const toIso = (local: string) => (local ? new Date(`${local}:00+05:00`).toISOString() : null)

export function PromotionEditor({ initial, collections, canWrite }: { initial: PromotionDraft; collections: { slug: string; title: string }[]; canWrite: boolean }) {
  const hydrated = useHydrated()
  const id = useId()
  const router = useRouter()
  const [form, setForm] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [basket, setBasket] = useState({ kind: "new" as "new" | "preloved", collection: "", quantity: 1, unitPrice: "14999", group: "retail" as "retail" | "wholesale", previousOrders: 0 })
  const [simulation, setSimulation] = useState<null | { subtotal: number; discount: number; total: number; freeShipping: boolean; applies: boolean; reason: string | null }>(null)
  const update = (changes: Partial<PromotionDraft>) => setForm((current) => ({ ...current, ...changes }))
  const select = cn(adminControl, "h-9 w-auto")
  const small = cn(adminControl, "h-9 w-32")

  function payload(): PromotionInput | null {
    const parsed = promotionInput.safeParse({ ...form, startsAt: toIso(form.startsAt), endsAt: toIso(form.endsAt) })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form.")
      return null
    }
    return parsed.data
  }

  async function save() {
    const body = payload()
    if (!body) return
    setBusy(true)
    setError(null)
    try {
      const saved = await request<{ id: string }>(form.id ? `/api/admin/promotions/${form.id}` : "/api/admin/promotions", { method: form.id ? "PUT" : "POST", body })
      if (form.id) router.refresh()
      else router.replace(`/admin/promotions/${saved.id}`)
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }

  async function simulate() {
    const promotion = payload()
    if (!promotion) return
    setError(null)
    try {
      setSimulation(
        await request("/api/admin/promotions/simulate", {
          method: "POST",
          body: {
            promotion: { ...promotion, id: form.id, timesUsed: form.timesUsed },
            basket: { lines: [{ kind: basket.kind, collections: basket.collection ? [basket.collection] : [], quantity: basket.quantity, unitPrice: toMinor(basket.unitPrice) }], customerGroup: basket.group, previousOrders: basket.previousOrders },
          },
        }),
      )
    } catch (failure) {
      setError(message(failure))
    }
  }

  async function newCode() {
    try {
      update({ code: (await request<{ code: string }>("/api/admin/promotions/code")).code })
    } catch (failure) {
      setError(message(failure))
    }
  }

  const setCondition = (index: number, condition: Condition) => update({ conditions: form.conditions.map((entry, at) => (at === index ? condition : entry)) })
  const setAction = (index: number, action: Action) => update({ actions: form.actions.map((entry, at) => (at === index ? action : entry)) })

  return (
    <form
      noValidate
      className="grid items-start gap-6 lg:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <fieldset disabled={!canWrite || !hydrated} className="min-w-0 flex flex-col gap-6 lg:col-span-2">
        <AdminCard title="Basics">
          <AdminField formId={id} name="title" label="Title" hint="Staff-facing name, also shown in the bag when it applies." value={form.title} onChange={(event) => update({ title: event.target.value })} />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <AdminField formId={id} name="code" label="Code" hint="Leave empty for an automatic promotion (no code needed)." value={form.code ?? ""} onChange={(event) => update({ code: event.target.value.toUpperCase() || null })} />
            </div>
            <button type="button" onClick={() => void newCode()} className={adminButton({ tone: "secondary" })}>
              Generate
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField formId={id} name="startsAt" type="datetime-local" label="Starts (Pakistan time)" value={form.startsAt} onChange={(event) => update({ startsAt: event.target.value })} />
            <AdminField formId={id} name="endsAt" type="datetime-local" label="Ends" value={form.endsAt} onChange={(event) => update({ endsAt: event.target.value })} />
            <AdminField formId={id} name="usageLimit" type="number" min={1} label="Uses in total (optional)" value={form.usageLimit ?? ""} onChange={(event) => update({ usageLimit: event.target.value ? Number(event.target.value) : null })} />
            <AdminField formId={id} name="perCustomerLimit" type="number" min={1} label="Uses per customer (optional)" value={form.perCustomerLimit ?? ""} onChange={(event) => update({ perCustomerLimit: event.target.value ? Number(event.target.value) : null })} />
          </div>
          <label className="flex items-center gap-2 text-16">
            <input type="checkbox" checked={form.combinable} onChange={(event) => update({ combinable: event.target.checked })} className="size-4 accent-foreground" /> Can be combined with other promotions
          </label>
          <label className="flex items-center gap-2 text-16">
            <input type="checkbox" checked={form.active} onChange={(event) => update({ active: event.target.checked })} className="size-4 accent-foreground" /> Switched on
          </label>
        </AdminCard>

        <AdminCard title="When it applies" description="Every condition must hold. No conditions: every bag.">
          <ul className="flex flex-col gap-2">
            {form.conditions.map((condition, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                <select aria-label={`Condition ${index + 1}`} value={condition.type} onChange={(event) => setCondition(index, blankCondition(event.target.value as Condition["type"]))} className={select}>
                  {CONDITIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {condition.type === "subtotal_at_least" ? <input aria-label="Subtotal in rupees" inputMode="decimal" value={rupees(condition.amount)} onChange={(event) => setCondition(index, { type: "subtotal_at_least", amount: toMinor(event.target.value) })} className={small} /> : null}
                {condition.type === "min_quantity" ? <input aria-label="Pairs" type="number" min={1} value={condition.quantity} onChange={(event) => setCondition(index, { type: "min_quantity", quantity: Number(event.target.value) || 1 })} className={small} /> : null}
                {condition.type === "product_kind" ? (
                  <select aria-label="Type" value={condition.kind} onChange={(event) => setCondition(index, { type: "product_kind", kind: event.target.value as "new" | "preloved" })} className={select}>
                    <option value="new">Brand new</option>
                    <option value="preloved">Pre-loved</option>
                  </select>
                ) : null}
                {condition.type === "collection" ? (
                  <select aria-label="Collection" value={condition.slugs[0] ?? ""} onChange={(event) => setCondition(index, { type: "collection", slugs: event.target.value ? [event.target.value] : [] })} className={select}>
                    <option value="">Choose…</option>
                    {collections.map((collection) => (
                      <option key={collection.slug} value={collection.slug}>
                        {collection.title}
                      </option>
                    ))}
                  </select>
                ) : null}
                {condition.type === "customer_group" ? (
                  <select aria-label="Group" value={condition.groups[0]} onChange={(event) => setCondition(index, { type: "customer_group", groups: [event.target.value as "retail" | "wholesale"] })} className={select}>
                    <option value="retail">Retail</option>
                    <option value="wholesale">Wholesale</option>
                  </select>
                ) : null}
                <button type="button" aria-label={`Remove condition ${index + 1}`} onClick={() => update({ conditions: form.conditions.filter((_, at) => at !== index) })} className={cn(adminButton({ tone: "ghost", size: "icon" }), "ms-auto")}>
                  <Trash2 />
                </button>
              </li>
            ))}
          </ul>
          <div>
            <button type="button" onClick={() => update({ conditions: [...form.conditions, blankCondition("subtotal_at_least")] })} className={adminButton({ tone: "secondary", size: "sm" })}>
              <Plus aria-hidden /> Add condition
            </button>
          </div>
        </AdminCard>

        <AdminCard title="What it gives">
          <ul className="flex flex-col gap-2">
            {form.actions.map((action, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                <select aria-label={`Benefit ${index + 1}`} value={action.type} onChange={(event) => setAction(index, blankAction(event.target.value as Action["type"]))} className={select}>
                  {ACTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {action.type === "percent_off_order" || action.type === "percent_off_items" ? (
                  <span className="flex items-center gap-1 text-14">
                    <input aria-label="Percent" type="number" min={1} max={100} value={action.basisPoints / 100} onChange={(event) => setAction(index, { ...action, basisPoints: Math.round(Number(event.target.value) * 100) })} className={cn(adminControl, "h-9 w-20")} />%
                  </span>
                ) : null}
                {action.type === "fixed_off_order" ? <input aria-label="Amount in rupees" inputMode="decimal" value={rupees(action.amount)} onChange={(event) => setAction(index, { type: "fixed_off_order", amount: toMinor(event.target.value) })} className={small} /> : null}
                {action.type === "percent_off_items" ? (
                  <select aria-label="Which pairs" value={action.kind ?? ""} onChange={(event) => setAction(index, { ...action, kind: (event.target.value || undefined) as "new" | "preloved" | undefined })} className={select}>
                    <option value="">All pairs</option>
                    <option value="new">Brand new pairs</option>
                    <option value="preloved">Pre-loved pairs</option>
                  </select>
                ) : null}
                {form.actions.length > 1 ? (
                  <button type="button" aria-label={`Remove benefit ${index + 1}`} onClick={() => update({ actions: form.actions.filter((_, at) => at !== index) })} className={cn(adminButton({ tone: "ghost", size: "icon" }), "ms-auto")}>
                    <Trash2 />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <div>
            <button type="button" onClick={() => update({ actions: [...form.actions, blankAction("free_shipping")] })} className={adminButton({ tone: "secondary", size: "sm" })}>
              <Plus aria-hidden /> Add benefit
            </button>
          </div>
        </AdminCard>
        <FormAlert>{error}</FormAlert>
        {canWrite ? (
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className={adminButton({ tone: "primary" })}>
              {busy ? "Saving…" : form.id ? "Save" : "Create promotion"}
            </button>
          </div>
        ) : null}
      </fieldset>

      <AdminCard title="Try it" description="Runs this promotion, as it is in the form, on a test bag with the checkout's own engine. Nothing is saved.">
        <div className="grid grid-cols-2 gap-2 text-14">
          <label className="flex flex-col gap-1 font-bold">
            Pair
            <select value={basket.kind} onChange={(event) => setBasket({ ...basket, kind: event.target.value as "new" | "preloved" })} className={select}>
              <option value="new">Brand new</option>
              <option value="preloved">Pre-loved</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 font-bold">
            Price (Rs.)
            <input inputMode="decimal" value={basket.unitPrice} onChange={(event) => setBasket({ ...basket, unitPrice: event.target.value })} className={small} />
          </label>
          <label className="flex flex-col gap-1 font-bold">
            Quantity
            <input type="number" min={1} max={20} value={basket.quantity} onChange={(event) => setBasket({ ...basket, quantity: Number(event.target.value) || 1 })} className={small} />
          </label>
          <label className="flex flex-col gap-1 font-bold">
            Collection
            <select value={basket.collection} onChange={(event) => setBasket({ ...basket, collection: event.target.value })} className={select}>
              <option value="">None</option>
              {collections.map((collection) => (
                <option key={collection.slug} value={collection.slug}>
                  {collection.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-bold">
            Group
            <select value={basket.group} onChange={(event) => setBasket({ ...basket, group: event.target.value as "retail" | "wholesale" })} className={select}>
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 font-bold">
            Past orders
            <input type="number" min={0} value={basket.previousOrders} onChange={(event) => setBasket({ ...basket, previousOrders: Number(event.target.value) || 0 })} className={small} />
          </label>
        </div>
        <button type="button" disabled={!hydrated} onClick={() => void simulate()} className={adminButton({ tone: "secondary" })}>
          Run test
        </button>
        {simulation ? (
          <div role="status" className="flex flex-col gap-1 rounded-md bg-surface p-3 text-16">
            {simulation.applies ? (
              <>
                <p className="font-semibold">It applies.</p>
                <p>
                  {formatPrice(simulation.subtotal)} − {formatPrice(simulation.discount)} = <strong>{formatPrice(simulation.total)}</strong>
                </p>
                {simulation.freeShipping ? <p>Free delivery.</p> : null}
              </>
            ) : (
              <p>
                <span className="font-semibold">It doesn&apos;t apply:</span> {simulation.reason}
              </p>
            )}
          </div>
        ) : null}
      </AdminCard>
    </form>
  )
}
