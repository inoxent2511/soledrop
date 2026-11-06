"use client"

import { Pencil, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { ApiError, request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { AdminField, FormAlert } from "@/components/admin/form"
import { FormDialog } from "@/components/admin/form-dialog"
import type { SynonymGroup } from "@/server/search/types"

/** Words that should find the same products ("trainers" → sneakers). Also used from a zero-result query. */
export function SynonymsEditor({ synonyms, canWrite, suggestion }: { synonyms: SynonymGroup[]; canWrite: boolean; suggestion?: string }) {
  const id = useId()
  const router = useRouter()
  const [editing, setEditing] = useState<SynonymGroup | { term: string } | null>(suggestion ? { term: suggestion } : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(work: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await work()
      setEditing(null)
      router.refresh()
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "That didn't save. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-background">
        {synonyms.length === 0 ? <li className="p-3 text-16 text-subtle-foreground">No synonyms yet.</li> : null}
        {synonyms.map((group) => (
          <li key={group.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-16">
            <span>
              <strong>{group.term}</strong> also finds {group.synonyms.join(", ")}
            </span>
            {canWrite ? (
              <span className="flex gap-1">
                <button type="button" aria-label={`Edit ${group.term}`} onClick={() => setEditing(group)} className={adminButton({ tone: "ghost", size: "icon" })}>
                  <Pencil />
                </button>
                <button type="button" aria-label={`Delete ${group.term}`} disabled={busy} onClick={() => void run(() => request(`/api/admin/search/synonyms/${group.id}`, { method: "DELETE" }))} className={adminButton({ tone: "ghost", size: "icon" })}>
                  <Trash2 />
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {canWrite ? (
        <div>
          <button type="button" onClick={() => setEditing({ term: "" })} className={adminButton({ tone: "secondary", size: "sm" })}>
            <Plus aria-hidden /> Add synonyms
          </button>
        </div>
      ) : null}
      <FormAlert>{editing === null ? error : null}</FormAlert>
      <FormDialog
        open={editing !== null}
        onOpenChange={(next) => !next && setEditing(null)}
        title={editing && "id" in editing ? `Edit “${editing.term}”` : "Add synonyms"}
        description="A search for the word also finds products matching any of the others, and the other way round."
        submitLabel="Save"
        pending={busy}
        error={error}
        onSubmit={(form) => {
          const data = new FormData(form)
          const body = {
            term: String(data.get("term") ?? ""),
            synonyms: String(data.get("synonyms") ?? "")
              .split(",")
              .map((word) => word.trim())
              .filter(Boolean),
          }
          void run(() => (editing && "id" in editing ? request(`/api/admin/search/synonyms/${editing.id}`, { method: "PUT", body }) : request("/api/admin/search/synonyms", { method: "POST", body })))
        }}
      >
        <AdminField formId={id} name="term" label="Word shoppers type" defaultValue={editing?.term ?? ""} maxLength={60} />
        <AdminField formId={id} name="synonyms" label="Also find (comma-separated)" defaultValue={editing && "synonyms" in editing ? editing.synonyms.join(", ") : ""} hint="sneakers, shoes" />
      </FormDialog>
    </div>
  )
}
