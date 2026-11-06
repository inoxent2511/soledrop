"use client"

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { ApiError, request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { AdminField, AdminTextarea, FormAlert } from "@/components/admin/form"
import { FormDialog } from "@/components/admin/form-dialog"
import type { Faq } from "@/server/content/types"

const message = (failure: unknown) => (failure instanceof ApiError ? failure.message : "Something went wrong. Please try again.")

/** The FAQ page's questions, grouped as on the page: add, edit, delete, reorder. Changes go live at once. */
export function FaqManager({ faqs, canEdit }: { faqs: Faq[]; canEdit: boolean }) {
  const id = useId()
  const router = useRouter()
  const [editing, setEditing] = useState<Faq | "new" | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ordered = [...faqs].sort((a, b) => a.position - b.position)
  const categories = [...new Set(ordered.map((faq) => faq.category))]

  async function run(work: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await work()
      setEditing(null)
      router.refresh()
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }

  const move = (faq: Faq, by: number) => {
    const ids = ordered.map((entry) => entry.id)
    const index = ids.indexOf(faq.id)
    ids.splice(index, 1)
    ids.splice(index + by, 0, faq.id)
    void run(() => request("/api/admin/content/faqs/order", { method: "PUT", body: { ids } }))
  }

  return (
    <div className="flex flex-col gap-6">
      {canEdit ? (
        <div>
          <button type="button" onClick={() => setEditing("new")} className={adminButton({ tone: "primary", size: "sm" })}>
            <Plus aria-hidden /> Add question
          </button>
        </div>
      ) : null}
      <FormAlert>{editing === null ? error : null}</FormAlert>
      {categories.map((category) => (
        <section key={category} className="flex flex-col gap-2">
          <h2 className="text-18 font-bold">{category}</h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-background">
            {ordered
              .filter((faq) => faq.category === category)
              .map((faq) => {
                const index = ordered.indexOf(faq)
                return (
                  <li key={faq.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-16 font-semibold">{faq.question}</p>
                      <p className="line-clamp-2 text-14 text-subtle-foreground">{faq.answer}</p>
                    </div>
                    {canEdit ? (
                      <span className="flex gap-1">
                        <button type="button" aria-label={`Move “${faq.question}” up`} disabled={busy || index === 0} onClick={() => move(faq, -1)} className={adminButton({ tone: "ghost", size: "icon" })}>
                          <ArrowUp />
                        </button>
                        <button type="button" aria-label={`Move “${faq.question}” down`} disabled={busy || index === ordered.length - 1} onClick={() => move(faq, 1)} className={adminButton({ tone: "ghost", size: "icon" })}>
                          <ArrowDown />
                        </button>
                        <button type="button" aria-label={`Edit “${faq.question}”`} onClick={() => setEditing(faq)} className={adminButton({ tone: "ghost", size: "icon" })}>
                          <Pencil />
                        </button>
                        <button type="button" aria-label={`Delete “${faq.question}”`} disabled={busy} onClick={() => void run(() => request(`/api/admin/content/faqs/${faq.id}`, { method: "DELETE" }))} className={adminButton({ tone: "ghost", size: "icon" })}>
                          <Trash2 />
                        </button>
                      </span>
                    ) : null}
                  </li>
                )
              })}
          </ul>
        </section>
      ))}

      <FormDialog
        open={editing !== null}
        onOpenChange={(next) => !next && setEditing(null)}
        title={editing === "new" ? "Add a question" : "Edit question"}
        description="It goes live on the FAQ page as soon as you save."
        submitLabel="Save"
        pending={busy}
        error={error}
        onSubmit={(form) => {
          const data = new FormData(form)
          const body = { category: String(data.get("category") ?? ""), question: String(data.get("question") ?? ""), answer: String(data.get("answer") ?? "") }
          void run(() => (editing === "new" || editing === null ? request("/api/admin/content/faqs", { method: "POST", body }) : request(`/api/admin/content/faqs/${editing.id}`, { method: "PUT", body })))
        }}
      >
        <AdminField formId={id} name="category" label="Group" list={`${id}-categories`} defaultValue={editing && editing !== "new" ? editing.category : (categories[0] ?? "")} />
        <datalist id={`${id}-categories`}>
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
        <AdminField formId={id} name="question" label="Question" maxLength={300} defaultValue={editing && editing !== "new" ? editing.question : ""} />
        <AdminTextarea formId={id} name="answer" label="Answer" maxLength={3000} rows={6} defaultValue={editing && editing !== "new" ? editing.answer : ""} />
      </FormDialog>
    </div>
  )
}
