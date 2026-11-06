"use client"

import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useId, useState } from "react"

import { adminCatalogApi } from "@/api/admin/catalog"
import { ApiError } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { adminControl, AdminField, AdminSelect, AdminTextarea, FormAlert } from "@/components/admin/form"
import { StatusPill } from "@/components/admin/status-pill"
import { useStepUp } from "@/components/admin/step-up"
import { MediaPicker } from "@/features/admin/media/components/media-library"
import { productInput, slugify, type ProductInput } from "@/features/admin/products/schema"
import { cn } from "@/lib/utils"

const GRADES = [
  { value: "like-new", label: "Like New" },
  { value: "premium", label: "Premium" },
  { value: "excellent", label: "Excellent" },
  { value: "very-good", label: "Very Good" },
  { value: "minor-issue", label: "Minor Issue" },
] as const

type VariantRow = { id?: string; sku: string; eu: string; uk: string; us: string; cm: string; weightGrams: string; price: string; compareAt: string }
type ImageRow = ProductInput["images"][number]

export type EditorInitial = {
  id?: string
  updatedAt?: string
  status: "draft" | "active" | "archived"
  title: string
  slug: string
  brandId: string
  kind: "new" | "preloved"
  gender: "men" | "women" | "kids" | "unisex"
  description: string
  condition: ProductInput["condition"]
  conditionNotes: string
  tags: string[]
  collections: string[]
  seo: { title?: string; description?: string }
  images: ImageRow[]
  variants: VariantRow[]
  stock: Record<string, number>
}

type Props = {
  initial: EditorInitial
  brands: { id: string; name: string }[]
  collections: { slug: string; title: string }[]
  can: { write: boolean; publish: boolean; price: boolean; delete: boolean; upload: boolean }
}

const major = (value: string) => {
  if (!value.trim()) return null
  const amount = Number(value.replace(/,/g, ""))
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : Number.NaN
}

const message = (failure: unknown) => (failure instanceof ApiError ? failure.message : "Something went wrong. Please try again.")
const STATUS = { active: { label: "Live", tone: "success" }, draft: { label: "Draft", tone: "pending" }, archived: { label: "Archived", tone: "neutral" } } as const

/** Create or edit a product: details, photos, sizes and prices, collections, SEO; publish and delete. */
export function ProductEditor({ initial, brands: initialBrands, collections, can }: Props) {
  const id = useId()
  const router = useRouter()
  const withStepUp = useStepUp()
  const [form, setForm] = useState(initial)
  const [brands, setBrands] = useState(initialBrands)
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [picker, setPicker] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [newBrand, setNewBrand] = useState("")
  const readOnly = !can.write

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const update = (changes: Partial<EditorInitial>) => {
    setForm((current) => ({ ...current, ...changes }))
    setDirty(true)
  }
  const setVariant = (index: number, changes: Partial<VariantRow>) => update({ variants: form.variants.map((row, at) => (at === index ? { ...row, ...changes } : row)) })
  const setImage = (index: number, changes: Partial<ImageRow>) => update({ images: form.images.map((row, at) => (at === index ? { ...row, ...changes } : changes.role === "card" ? { ...row, role: "gallery" } : row)) })
  const moveImage = (index: number, by: number) => {
    const next = [...form.images]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item)
    update({ images: next })
  }

  function payload(): ProductInput | null {
    const variants = form.variants.map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      sku: row.sku,
      size: { eu: row.eu, uk: row.uk, us: row.us, cm: row.cm },
      weightGrams: Number(row.weightGrams || 0),
      price: can.price ? major(row.price) : null,
      compareAt: can.price ? major(row.compareAt) : null,
    }))
    if (variants.some((variant) => Number.isNaN(variant.price) || Number.isNaN(variant.compareAt))) {
      setFormError("Prices must be numbers, like 14999.")
      return null
    }
    const parsed = productInput.safeParse({
      title: form.title,
      slug: form.slug,
      brandId: form.brandId,
      kind: form.kind,
      gender: form.gender,
      description: form.description,
      condition: form.kind === "preloved" ? form.condition : null,
      conditionNotes: form.kind === "preloved" ? form.conditionNotes || null : null,
      tags: form.tags,
      collections: form.collections,
      seo: { title: form.seo.title || undefined, description: form.seo.description || undefined },
      images: form.images,
      variants,
    })
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message
      setErrors(next)
      setFormError("Please check the highlighted fields.")
      return null
    }
    setErrors({})
    return parsed.data
  }

  async function save() {
    const input = payload()
    if (!input) return
    setSaving(true)
    setFormError(null)
    try {
      if (form.id) {
        const saved = await adminCatalogApi.saveProduct(form.id, input, form.updatedAt ?? "")
        setForm((current) => ({ ...current, updatedAt: saved.updatedAt }))
        setDirty(false)
        router.refresh()
      } else {
        const created = await adminCatalogApi.createProduct(input)
        setDirty(false)
        router.replace(`/admin/products/${created.id}`)
      }
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409 && /Someone else saved/.test(failure.message)) setConflict(true)
      if (failure instanceof ApiError && failure.fields) setErrors(Object.fromEntries(Object.entries(failure.fields).map(([key, value]) => [key, value?.[0] ?? ""])))
      setFormError(message(failure))
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(status: "draft" | "active" | "archived") {
    if (!form.id) return
    if (dirty) return setFormError("Save your changes first.")
    setSaving(true)
    setFormError(null)
    try {
      const result = await adminCatalogApi.setStatus(form.id, status, form.updatedAt)
      setForm((current) => ({ ...current, status: result.status as EditorInitial["status"], updatedAt: result.updatedAt }))
      router.refresh()
    } catch (failure) {
      setFormError(message(failure))
    } finally {
      setSaving(false)
    }
  }

  async function addBrand() {
    if (newBrand.trim().length < 2) return
    try {
      const { brand } = await adminCatalogApi.createBrand(newBrand.trim())
      setBrands((current) => [...current, brand])
      update({ brandId: brand.id })
      setNewBrand("")
    } catch (failure) {
      setFormError(message(failure))
    }
  }

  const err = (path: string) => errors[path]

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="sticky top-16 z-nav flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface/95 py-3 backdrop-blur">
        <p className="flex items-center gap-2 text-16">
          <StatusPill tone={STATUS[form.status].tone}>{STATUS[form.status].label}</StatusPill>
          {dirty ? <span className="text-subtle-foreground">Unsaved changes</span> : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {form.id && can.publish ? (
            <>
              {form.status !== "active" ? (
                <button type="button" disabled={saving} onClick={() => void setStatus("active")} className={adminButton({ tone: "secondary", size: "sm" })}>
                  Publish
                </button>
              ) : (
                <button type="button" disabled={saving} onClick={() => void setStatus("draft")} className={adminButton({ tone: "secondary", size: "sm" })}>
                  Unpublish
                </button>
              )}
              {form.status !== "archived" ? (
                <button type="button" disabled={saving} onClick={() => void setStatus("archived")} className={adminButton({ tone: "ghost", size: "sm" })}>
                  Archive
                </button>
              ) : null}
            </>
          ) : null}
          {form.id && can.delete ? (
            <button type="button" onClick={() => setDeleting(true)} className={adminButton({ tone: "ghost", size: "sm" })}>
              <Trash2 aria-hidden /> Delete
            </button>
          ) : null}
          {can.write ? (
            <button type="submit" disabled={saving} className={adminButton({ tone: "primary", size: "sm" })}>
              {saving ? "Saving…" : form.id ? "Save" : "Create draft"}
            </button>
          ) : null}
        </div>
      </div>

      {conflict ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-brand-tint px-4 py-3 text-16">
          <span>Someone else saved this product while you were editing. Reload to see their version (your changes here will be lost).</span>
          <button type="button" onClick={() => window.location.reload()} className={adminButton({ tone: "secondary", size: "sm" })}>
            Reload
          </button>
        </div>
      ) : null}
      <FormAlert>{formError}</FormAlert>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <AdminCard title="Details">
            <fieldset disabled={readOnly} className="flex flex-col gap-4">
              <AdminField
                formId={id}
                name="title"
                label="Title"
                value={form.title}
                error={err("title")}
                onChange={(event) => update({ title: event.target.value, ...(slugTouched ? {} : { slug: slugify(event.target.value) }) })}
              />
              <AdminField
                formId={id}
                name="slug"
                label="Web address"
                hint={`soledrop…/products/${form.slug || "…"}`}
                value={form.slug}
                error={err("slug")}
                onChange={(event) => {
                  setSlugTouched(true)
                  update({ slug: event.target.value })
                }}
              />
              <AdminTextarea formId={id} name="description" label="Description" value={form.description} rows={6} error={err("description")} onChange={(event) => update({ description: event.target.value })} />
            </fieldset>
          </AdminCard>

          <AdminCard
            title="Photos"
            description="The photo marked “Card” shows on listing cards; the rest fill the product page, in this order."
            actions={
              can.write ? (
                <button type="button" onClick={() => setPicker(true)} className={adminButton({ tone: "secondary", size: "sm" })}>
                  <ImagePlus aria-hidden /> Add photos
                </button>
              ) : null
            }
          >
            {form.images.length === 0 ? <p className="text-16 text-subtle-foreground">No photos yet. A product needs one before it can go live.</p> : null}
            <ul className="flex flex-col gap-3">
              {form.images.map((image, index) => (
                <li key={image.url} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- editor thumbnail */}
                  <img src={image.url} alt="" width={64} height={64} className="size-16 rounded-sm bg-surface object-contain" />
                  <div className="flex min-w-48 flex-1 flex-col gap-1">
                    <label className="text-14 font-bold" htmlFor={`${id}-alt-${index}`}>
                      Alt text
                    </label>
                    <input id={`${id}-alt-${index}`} value={image.alt} disabled={readOnly} maxLength={300} onChange={(event) => setImage(index, { alt: event.target.value })} className={cn(adminControl, "h-9")} />
                  </div>
                  <label className="flex items-center gap-1.5 text-14">
                    <input type="radio" name={`${id}-card`} checked={image.role === "card"} disabled={readOnly} onChange={() => setImage(index, { role: "card" })} className="size-4 accent-foreground" /> Card
                  </label>
                  {can.write ? (
                    <div className="flex gap-1">
                      <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => moveImage(index, -1)} className={adminButton({ tone: "ghost", size: "icon" })}>
                        <ArrowUp />
                      </button>
                      <button type="button" aria-label="Move down" disabled={index === form.images.length - 1} onClick={() => moveImage(index, 1)} className={adminButton({ tone: "ghost", size: "icon" })}>
                        <ArrowDown />
                      </button>
                      <button type="button" aria-label="Remove photo" onClick={() => update({ images: form.images.filter((_, at) => at !== index) })} className={adminButton({ tone: "ghost", size: "icon" })}>
                        <Trash2 />
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <FormAlert>{err("images")}</FormAlert>
          </AdminCard>

          <AdminCard title="Sizes and prices" description={can.price ? "Prices in PKR. “Was” shows the item as on sale." : "You can't change prices; the price columns are read-only."}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-3xl border-collapse text-14">
                <thead className="text-subtle-foreground">
                  <tr>
                    {["EU", "UK", "US", "cm", "SKU", "Price", "Was", "Stock", ""].map((label) => (
                      <th key={label} scope="col" className="h-9 px-1 text-start font-semibold">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.variants.map((row, index) => (
                    <tr key={row.id ?? `new-${index}`} className="border-t border-border">
                      {(["eu", "uk", "us", "cm"] as const).map((field) => (
                        <td key={field} className="px-1 py-1.5">
                          <input aria-label={`${field.toUpperCase()} size, row ${index + 1}`} value={row[field]} disabled={readOnly} maxLength={8} onChange={(event) => setVariant(index, { [field]: event.target.value })} className={cn(adminControl, "h-9 w-16 px-2")} />
                        </td>
                      ))}
                      <td className="px-1 py-1.5">
                        <input aria-label={`SKU, row ${index + 1}`} value={row.sku} disabled={readOnly} maxLength={40} onChange={(event) => setVariant(index, { sku: event.target.value })} aria-invalid={err(`variants.${index}.sku`) ? true : undefined} className={cn(adminControl, "h-9 w-36 px-2")} />
                      </td>
                      <td className="px-1 py-1.5">
                        <input aria-label={`Price, row ${index + 1}`} inputMode="decimal" value={row.price} disabled={readOnly || !can.price} onChange={(event) => setVariant(index, { price: event.target.value })} className={cn(adminControl, "h-9 w-28 px-2")} />
                      </td>
                      <td className="px-1 py-1.5">
                        <input aria-label={`Was price, row ${index + 1}`} inputMode="decimal" value={row.compareAt} disabled={readOnly || !can.price} onChange={(event) => setVariant(index, { compareAt: event.target.value })} aria-invalid={err(`variants.${index}.compareAt`) ? true : undefined} className={cn(adminControl, "h-9 w-28 px-2")} />
                      </td>
                      <td className="px-1 py-1.5 tabular-nums">{row.id ? (form.stock[row.id] ?? 0) : "—"}</td>
                      <td className="px-1 py-1.5">
                        {can.write && form.variants.length > 1 ? (
                          <button type="button" aria-label={`Remove size row ${index + 1}`} onClick={() => update({ variants: form.variants.filter((_, at) => at !== index) })} className={adminButton({ tone: "ghost", size: "icon" })}>
                            <Trash2 />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {Object.entries(errors)
              .filter(([path]) => path.startsWith("variants"))
              .map(([path, text]) => (
                <FormAlert key={path}>{`Row ${Number(path.split(".")[1] ?? 0) + 1}: ${text}`}</FormAlert>
              ))}
            {can.write ? (
              <div>
                <button
                  type="button"
                  onClick={() => update({ variants: [...form.variants, { sku: form.slug ? `${form.slug.slice(0, 24).toUpperCase()}-${form.variants.length + 1}` : "", eu: "", uk: "", us: "", cm: "", weightGrams: "0", price: form.variants.at(-1)?.price ?? "", compareAt: "" }] })}
                  className={adminButton({ tone: "secondary", size: "sm" })}
                >
                  <Plus aria-hidden /> Add size
                </button>
              </div>
            ) : null}
            <p className="text-14 text-subtle-foreground">Stock is changed on the Inventory page, with a reason.</p>
          </AdminCard>

          <AdminCard title="Search engines">
            <fieldset disabled={readOnly} className="flex flex-col gap-4">
              <AdminField formId={id} name="seoTitle" label={`Page title (${(form.seo.title ?? "").length}/70)`} maxLength={70} value={form.seo.title ?? ""} onChange={(event) => update({ seo: { ...form.seo, title: event.target.value } })} />
              <AdminTextarea formId={id} name="seoDescription" label={`Description (${(form.seo.description ?? "").length}/160)`} maxLength={160} value={form.seo.description ?? ""} onChange={(event) => update({ seo: { ...form.seo, description: event.target.value } })} />
            </fieldset>
          </AdminCard>
        </div>

        <div className="flex flex-col gap-6">
          <AdminCard title="Organise">
            <fieldset disabled={readOnly} className="flex flex-col gap-4">
              <AdminSelect formId={id} name="brandId" label="Brand" value={form.brandId} error={err("brandId")} onChange={(event) => update({ brandId: event.target.value })}>
                <option value="">Choose a brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </AdminSelect>
              <div className="flex items-end gap-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  <label htmlFor={`${id}-new-brand`} className="text-14 font-bold">
                    New brand
                  </label>
                  <input id={`${id}-new-brand`} value={newBrand} onChange={(event) => setNewBrand(event.target.value)} className={adminControl} />
                </div>
                <button type="button" onClick={() => void addBrand()} className={adminButton({ tone: "secondary" })}>
                  Add
                </button>
              </div>
              <AdminSelect formId={id} name="kind" label="Type" value={form.kind} onChange={(event) => update({ kind: event.target.value as EditorInitial["kind"] })}>
                <option value="new">Brand new</option>
                <option value="preloved">Pre-loved</option>
              </AdminSelect>
              {form.kind === "preloved" ? (
                <>
                  <AdminSelect formId={id} name="condition" label="Condition" value={form.condition ?? ""} error={err("condition")} onChange={(event) => update({ condition: (event.target.value || null) as EditorInitial["condition"] })}>
                    <option value="">Choose a grade</option>
                    {GRADES.map((grade) => (
                      <option key={grade.value} value={grade.value}>
                        {grade.label}
                      </option>
                    ))}
                  </AdminSelect>
                  <AdminTextarea formId={id} name="conditionNotes" label="Condition notes" hint="Shown on the product page: marks, wear, what's included." maxLength={500} value={form.conditionNotes} onChange={(event) => update({ conditionNotes: event.target.value })} />
                </>
              ) : null}
              <AdminSelect formId={id} name="gender" label="For" value={form.gender} onChange={(event) => update({ gender: event.target.value as EditorInitial["gender"] })}>
                <option value="men">Men</option>
                <option value="women">Women</option>
                <option value="unisex">Unisex</option>
                <option value="kids">Kids</option>
              </AdminSelect>
              <AdminField
                formId={id}
                name="tags"
                label="Tags"
                hint="Comma-separated: running, retro"
                defaultValue={form.tags.join(", ")}
                onChange={(event) =>
                  update({
                    tags: event.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  })
                }
              />
              <fieldset className="flex flex-col gap-1.5">
                <legend className="pb-1 text-14 font-bold">Collections</legend>
                {collections.map((collection) => (
                  <label key={collection.slug} className="flex items-center gap-2 text-16">
                    <input
                      type="checkbox"
                      checked={form.collections.includes(collection.slug)}
                      onChange={(event) => update({ collections: event.target.checked ? [...form.collections, collection.slug] : form.collections.filter((slug) => slug !== collection.slug) })}
                      className="size-4 accent-foreground"
                    />
                    {collection.title}
                  </label>
                ))}
                <p className="text-14 text-subtle-foreground">Rule-based collections pick products by themselves.</p>
              </fieldset>
            </fieldset>
          </AdminCard>
        </div>
      </div>

      <MediaPicker
        open={picker}
        onOpenChange={setPicker}
        canUpload={can.upload}
        chosen={form.images.map((image) => image.url)}
        onPick={(item) => {
          if (form.images.some((image) => image.url === item.url)) return
          setForm((current) => ({ ...current, images: [...current.images, { url: item.url, alt: item.alt, width: item.width, height: item.height, role: current.images.some((image) => image.role === "card") ? "gallery" : "card" }] }))
          setDirty(true)
        }}
      />

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this product for good?"
        consequence="Its sizes, prices, stock and photos links go too. Products that have been ordered can't be deleted; archive them instead. You'll be asked for your authenticator code."
        confirmLabel="Delete product"
        typeToConfirm={form.slug}
        reason="required"
        pending={saving}
        error={formError}
        onConfirm={({ reason }) => {
          if (!form.id) return
          setSaving(true)
          withStepUp(() => adminCatalogApi.deleteProduct(form.id as string, reason ?? ""))
            .then(() => {
              setDirty(false)
              router.replace("/admin/products")
            })
            .catch((failure) => setFormError(message(failure)))
            .finally(() => setSaving(false))
        }}
      />
    </form>
  )
}
