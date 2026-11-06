"use client"

import { useRouter } from "next/navigation"
import { useEffect, useId, useState } from "react"

import { ApiError, request } from "@/api/http"
import { BlockEditor } from "@/components/admin/block-editor"
import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { AdminField, AdminTextarea, FormAlert } from "@/components/admin/form"
import { StatusPill } from "@/components/admin/status-pill"
import { pageInput } from "@/features/admin/content/schema"
import { slugify } from "@/features/admin/products/schema"
import { Blocks } from "@/features/content/components/block-registry"
import type { Page } from "@/server/content/types"

const message = (failure: unknown) => (failure instanceof ApiError ? failure.message : "Something went wrong. Please try again.")

/** Edit a content page with a live preview in the storefront's own block renderer. */
export function PageEditor({ initial, faqCategories, can }: { initial: Page | null; faqCategories: string[]; can: { write: boolean; publish: boolean } }) {
  const id = useId()
  const router = useRouter()
  const [form, setForm] = useState<Page>(initial ?? { slug: "", title: "", description: "", blocks: [{ type: "paragraph", text: "" }], seo: {}, updatedAt: "", published: false })
  const [slugTouched, setSlugTouched] = useState(Boolean(initial))
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const update = (changes: Partial<Page>) => {
    setForm((current) => ({ ...current, ...changes }))
    setDirty(true)
  }

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  async function save() {
    const parsed = pageInput.safeParse({ ...form, blocks: form.blocks.map((block) => (block.type === "list" ? { ...block, items: block.items.filter((item) => item.trim()) } : block)) })
    if (!parsed.success) return setError(`${parsed.error.issues[0]?.path.join(" › ")}: ${parsed.error.issues[0]?.message}`)
    setBusy(true)
    setError(null)
    try {
      const saved = initial
        ? await request<{ slug: string; updatedAt: string }>(`/api/admin/content/pages/${initial.slug}`, { method: "PUT", body: { ...parsed.data, expectedUpdatedAt: form.updatedAt } })
        : await request<{ slug: string; updatedAt: string }>("/api/admin/content/pages", { method: "POST", body: parsed.data })
      setDirty(false)
      if (!initial || saved.slug !== initial.slug) router.replace(`/admin/content/pages/${saved.slug}`)
      else router.refresh()
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }

  async function publish(published: boolean) {
    if (!initial) return
    if (dirty) return setError("Save your changes first.")
    setBusy(true)
    setError(null)
    try {
      await request(`/api/admin/content/pages/${initial.slug}/publish`, { method: "POST", body: { published } })
      router.refresh()
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-16">
          <StatusPill tone={form.published ? "success" : "pending"}>{form.published ? "Published" : "Draft"}</StatusPill>
          {form.published ? <span className="text-subtle-foreground">at /pages/{form.slug}</span> : null}
          {dirty ? <span className="text-subtle-foreground">· Unsaved changes</span> : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {initial && can.publish ? (
            <>
              <button type="button" disabled={busy} onClick={() => void publish(!form.published)} className={adminButton({ tone: "secondary", size: "sm" })}>
                {form.published ? "Unpublish" : "Publish"}
              </button>
              <button type="button" onClick={() => setDeleting(true)} className={adminButton({ tone: "ghost", size: "sm" })}>
                Delete
              </button>
            </>
          ) : null}
          {can.write ? (
            <button type="button" disabled={busy} onClick={() => void save()} className={adminButton({ tone: "primary", size: "sm" })}>
              {busy ? "Saving…" : initial ? "Save" : "Create draft"}
            </button>
          ) : null}
        </div>
      </div>
      <FormAlert>{error}</FormAlert>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <AdminCard title="Page">
            <fieldset disabled={!can.write} className="min-w-0 flex flex-col gap-4">
              <AdminField formId={id} name="title" label="Title" value={form.title} onChange={(event) => update({ title: event.target.value, ...(slugTouched ? {} : { slug: slugify(event.target.value) }) })} />
              <AdminField
                formId={id}
                name="slug"
                label="Web address"
                hint={`/pages/${form.slug || "…"}`}
                value={form.slug}
                onChange={(event) => {
                  setSlugTouched(true)
                  update({ slug: event.target.value })
                }}
              />
              <AdminTextarea formId={id} name="description" label="Summary (under the title)" maxLength={300} value={form.description} onChange={(event) => update({ description: event.target.value })} />
              <AdminField formId={id} name="seoTitle" label="Search title (optional)" maxLength={70} value={form.seo.title ?? ""} onChange={(event) => update({ seo: { ...form.seo, title: event.target.value || undefined } })} />
              <AdminTextarea formId={id} name="seoDescription" label="Search description (optional)" maxLength={160} value={form.seo.description ?? ""} onChange={(event) => update({ seo: { ...form.seo, description: event.target.value || undefined } })} />
            </fieldset>
          </AdminCard>
          <AdminCard title="Content">
            <BlockEditor blocks={form.blocks} onChange={(blocks) => update({ blocks })} disabled={!can.write} faqCategories={faqCategories} />
          </AdminCard>
        </div>
        <AdminCard title="Preview" description="As shoppers will see it (the FAQ group shows its questions on the live page).">
          <div className="rounded-md border border-border bg-surface p-4">
            <h1 className="font-display text-28 font-extrabold">{form.title || "Untitled"}</h1>
            {form.description ? <p className="pb-4 text-16 text-subtle-foreground">{form.description}</p> : null}
            <Blocks blocks={form.blocks} faqSlot={(category) => <p className="text-14 text-subtle-foreground">[The “{category}” questions appear here]</p>} />
          </div>
        </AdminCard>
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${form.title}”?`}
        consequence="The page goes, and links to it will show “not found”."
        confirmLabel="Delete page"
        typeToConfirm={initial?.slug}
        pending={busy}
        error={error}
        onConfirm={() => {
          if (!initial) return
          setBusy(true)
          request(`/api/admin/content/pages/${initial.slug}`, { method: "DELETE" })
            .then(() => router.replace("/admin/content"))
            .catch((failure) => setError(message(failure)))
            .finally(() => setBusy(false))
        }}
      />
    </div>
  )
}
