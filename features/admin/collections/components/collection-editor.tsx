"use client"

import { useQuery } from "@tanstack/react-query"
import { Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { adminCatalogApi } from "@/api/admin/catalog"
import { ApiError, request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { adminControl, AdminField, AdminTextarea, FormAlert } from "@/components/admin/form"
import { RuleBuilder } from "@/components/admin/rule-builder"
import { collectionInput } from "@/features/admin/collections/schema"
import { slugify } from "@/features/admin/products/schema"
import type { CollectionRule } from "@/server/catalog/types"
import type { StaffProductRow } from "@/server/catalog/staff"

export type CollectionDraft = {
  id?: string
  title: string
  slug: string
  headline: [string, string]
  description: string
  kind: "manual" | "rule"
  rules: CollectionRule[]
  seo: { title?: string; description?: string }
  products: { id: string; title: string }[]
}

const message = (failure: unknown) => (failure instanceof ApiError ? failure.message : "Something went wrong. Please try again.")

/** Search products to add to a manual collection. */
function ProductSearch({ chosen, onAdd }: { chosen: Set<string>; onAdd: (product: { id: string; title: string }) => void }) {
  const [q, setQ] = useState("")
  const results = useQuery({
    queryKey: ["admin", "product-search", q],
    queryFn: ({ signal }) => request<{ rows: StaffProductRow[] }>(`/api/admin/products?q=${encodeURIComponent(q)}&size=20`, { signal }),
    enabled: q.trim().length >= 2,
  })
  return (
    <div className="flex flex-col gap-2">
      <input type="search" aria-label="Find products to add" placeholder="Find products to add" value={q} onChange={(event) => setQ(event.target.value)} className={adminControl} />
      <ul className="flex flex-col divide-y divide-border">
        {results.data?.rows
          .filter((row) => !chosen.has(row.id))
          .map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 py-1.5 text-16">
              <span>
                {row.brand} {row.title}
              </span>
              <button type="button" onClick={() => onAdd({ id: row.id, title: `${row.brand} ${row.title}` })} className={adminButton({ tone: "secondary", size: "sm" })}>
                Add
              </button>
            </li>
          ))}
      </ul>
    </div>
  )
}

export function CollectionEditor({ initial, canWrite }: { initial: CollectionDraft; canWrite: boolean }) {
  const id = useId()
  const router = useRouter()
  const [form, setForm] = useState(initial)
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const update = (changes: Partial<CollectionDraft>) => setForm((current) => ({ ...current, ...changes }))

  async function save() {
    const parsed = collectionInput.safeParse({ ...form, productIds: form.kind === "manual" ? form.products.map((product) => product.id) : null })
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Please check the form.")
    setBusy(true)
    setError(null)
    try {
      const saved = await adminCatalogApi.saveCollection(parsed.data, form.id)
      if (form.id) router.refresh()
      else router.replace(`/admin/collections/${saved.id}`)
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <AdminCard title="Details">
        <fieldset disabled={!canWrite} className="min-w-0 flex flex-col gap-4">
          <AdminField formId={id} name="title" label="Title" value={form.title} onChange={(event) => update({ title: event.target.value, ...(slugTouched ? {} : { slug: slugify(event.target.value) }) })} />
          <AdminField
            formId={id}
            name="slug"
            label="Web address"
            hint={`/collections/${form.slug || "…"}`}
            value={form.slug}
            onChange={(event) => {
              setSlugTouched(true)
              update({ slug: event.target.value })
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField formId={id} name="headline0" label="Headline, first line" maxLength={40} value={form.headline[0]} onChange={(event) => update({ headline: [event.target.value, form.headline[1]] })} />
            <AdminField formId={id} name="headline1" label="Headline, second line" maxLength={40} value={form.headline[1]} onChange={(event) => update({ headline: [form.headline[0], event.target.value] })} />
          </div>
          <AdminTextarea formId={id} name="description" label="Description" maxLength={1000} value={form.description} onChange={(event) => update({ description: event.target.value })} />
        </fieldset>
      </AdminCard>

      <AdminCard title="Products">
        <fieldset disabled={!canWrite} className="min-w-0 flex flex-col gap-4">
          <div role="radiogroup" aria-label="How products are chosen" className="flex flex-wrap gap-4 text-16">
            <label className="flex items-center gap-2">
              <input type="radio" checked={form.kind === "manual"} onChange={() => update({ kind: "manual" })} className="size-4 accent-foreground" /> Pick products by hand
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={form.kind === "rule"} onChange={() => update({ kind: "rule", rules: form.rules.length ? form.rules : [{ field: "kind", equals: "new" }] })} className="size-4 accent-foreground" /> Match by rules
            </label>
          </div>
          {form.kind === "rule" ? (
            <RuleBuilder rules={form.rules} onChange={(rules) => update({ rules })} disabled={!canWrite} />
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-border">
                {form.products.map((product) => (
                  <li key={product.id} className="flex items-center justify-between gap-2 py-1.5 text-16">
                    {product.title}
                    {canWrite ? (
                      <button type="button" aria-label={`Remove ${product.title}`} onClick={() => update({ products: form.products.filter((entry) => entry.id !== product.id) })} className={adminButton({ tone: "ghost", size: "icon" })}>
                        <X />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {form.products.length === 0 ? <p className="text-16 text-subtle-foreground">No products yet.</p> : null}
              {canWrite ? <ProductSearch chosen={new Set(form.products.map((product) => product.id))} onAdd={(product) => update({ products: [...form.products, product] })} /> : null}
            </>
          )}
        </fieldset>
      </AdminCard>

      <AdminCard title="Search engines">
        <fieldset disabled={!canWrite} className="min-w-0 flex flex-col gap-4">
          <AdminField formId={id} name="seoTitle" label="Page title" maxLength={70} value={form.seo.title ?? ""} onChange={(event) => update({ seo: { ...form.seo, title: event.target.value } })} />
          <AdminTextarea formId={id} name="seoDescription" label="Description" maxLength={160} value={form.seo.description ?? ""} onChange={(event) => update({ seo: { ...form.seo, description: event.target.value } })} />
        </fieldset>
      </AdminCard>

      <FormAlert>{error}</FormAlert>
      {canWrite ? (
        <div className="flex flex-wrap justify-between gap-2">
          {form.id ? (
            <button type="button" onClick={() => setDeleting(true)} className={adminButton({ tone: "ghost" })}>
              <Trash2 aria-hidden /> Delete collection
            </button>
          ) : (
            <span />
          )}
          <button type="submit" disabled={busy} className={adminButton({ tone: "primary" })}>
            {busy ? "Saving…" : form.id ? "Save" : "Create collection"}
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${form.title}”?`}
        consequence="The collection page stops working and links to it show “not found”. Products stay in the catalogue."
        confirmLabel="Delete collection"
        typeToConfirm={form.slug}
        reason="optional"
        pending={busy}
        error={error}
        onConfirm={({ reason }) => {
          if (!form.id) return
          setBusy(true)
          adminCatalogApi
            .deleteCollection(form.id, reason)
            .then(() => router.replace("/admin/collections"))
            .catch((failure) => setError(message(failure)))
            .finally(() => setBusy(false))
        }}
      />
    </form>
  )
}
