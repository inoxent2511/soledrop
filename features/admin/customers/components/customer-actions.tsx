"use client"

import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { ApiError, request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { AdminField, AdminSelect, FormAlert } from "@/components/admin/form"
import { FormDialog } from "@/components/admin/form-dialog"
import { useStepUp } from "@/components/admin/step-up"

type Props = {
  id: string
  fullName: string
  phone: string | null
  email: string
  group: "retail" | "wholesale"
  marketingOptIn: boolean
  can: { write: boolean; pii: boolean; export: boolean; erase: boolean }
}

const message = (failure: unknown) => (failure instanceof ApiError ? failure.message : "Something went wrong. Please try again.")

/** Edit, sign out, export (data access request) and erase (deletion request) a customer. */
export function CustomerActions({ id, fullName, phone, email, group, marketingOptIn, can }: Props) {
  const formId = useId()
  const router = useRouter()
  const withStepUp = useStepUp()
  const [dialog, setDialog] = useState<null | "edit" | "export" | "erase">(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const base = `/api/admin/customers/${id}`

  async function run(work: () => Promise<unknown>, after?: () => void) {
    setPending(true)
    setError(null)
    try {
      await work()
      setDialog(null)
      after?.()
      router.refresh()
    } catch (failure) {
      setError(message(failure))
    } finally {
      setPending(false)
    }
  }

  async function download(reason: string) {
    const response = await fetch(`${base}/export`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }), credentials: "same-origin" })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new ApiError(response.status, body?.error?.code ?? "internal", body?.error?.message ?? "The export failed.", body?.error?.details)
    }
    const url = URL.createObjectURL(await response.blob())
    const link = Object.assign(document.createElement("a"), { href: url, download: `customer-${id}.json` })
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-2">
      {can.write ? (
        <button type="button" onClick={() => setDialog("edit")} className={adminButton({ tone: "secondary" })}>
          Edit customer
        </button>
      ) : null}
      {can.write ? (
        <button type="button" disabled={pending} onClick={() => void run(() => request(`${base}/sign-out`, { method: "POST" }), () => setNotice("Signed out on every device."))} className={adminButton({ tone: "ghost" })}>
          Sign out everywhere
        </button>
      ) : null}
      {can.export ? (
        <button type="button" onClick={() => setDialog("export")} className={adminButton({ tone: "ghost" })}>
          Export their data
        </button>
      ) : null}
      {can.erase ? (
        <button type="button" onClick={() => setDialog("erase")} className={adminButton({ tone: "ghost" })}>
          Erase personal data
        </button>
      ) : null}
      {notice ? (
        <p role="status" className="text-14 text-subtle-foreground">
          {notice}
        </p>
      ) : null}
      <FormAlert>{dialog === null ? error : null}</FormAlert>

      <FormDialog
        open={dialog === "edit"}
        onOpenChange={(next) => !next && setDialog(null)}
        title="Edit customer"
        submitLabel="Save"
        pending={pending}
        error={error}
        onSubmit={(form) => {
          const data = new FormData(form)
          const body = {
            ...(can.pii ? { fullName: String(data.get("fullName") ?? "").trim(), phone: String(data.get("phone") ?? "").trim() || null } : {}),
            group: data.get("group") === "wholesale" ? "wholesale" : "retail",
            marketingOptIn: data.get("marketingOptIn") === "on",
            reason: String(data.get("reason") ?? "").trim() || null,
          }
          void run(() => request(base, { method: "PATCH", body }))
        }}
      >
        {can.pii ? (
          <>
            <AdminField formId={formId} name="fullName" label="Name" defaultValue={fullName} maxLength={80} />
            <AdminField formId={formId} name="phone" label="Phone" defaultValue={phone ?? ""} maxLength={20} />
          </>
        ) : null}
        <AdminSelect formId={formId} name="group" label="Price group" defaultValue={group} hint="Wholesale customers see the wholesale price list.">
          <option value="retail">Retail</option>
          <option value="wholesale">Wholesale</option>
        </AdminSelect>
        <label className="flex items-center gap-2 text-16">
          <input type="checkbox" name="marketingOptIn" defaultChecked={marketingOptIn} className="size-4 accent-foreground" /> Agreed to marketing emails
        </label>
        <AdminField formId={formId} name="reason" label="Reason (optional)" maxLength={500} />
      </FormDialog>

      <ConfirmDialog
        open={dialog === "export"}
        onOpenChange={(next) => !next && setDialog(null)}
        title="Export this customer's data?"
        consequence="Downloads everything held about them (profile, addresses, orders) as a file. Only do this for a request from the customer, and send it to them securely."
        confirmLabel="Download"
        tone="primary"
        reason="required"
        pending={pending}
        error={error}
        onConfirm={({ reason }) => void run(() => withStepUp(() => download(reason ?? "")), () => setNotice("Export downloaded."))}
      />

      <ConfirmDialog
        open={dialog === "erase"}
        onOpenChange={(next) => !next && setDialog(null)}
        title="Erase this customer's personal data?"
        consequence="Their name, email, phone and addresses are removed and they can't sign in. Orders stay with amounts only, for the accounts. This can't be undone."
        confirmLabel="Erase"
        typeToConfirm={can.pii ? email : "ERASE"}
        reason="required"
        pending={pending}
        error={error}
        onConfirm={({ reason }) => void run(() => withStepUp(() => request(base, { method: "DELETE", body: { reason } })), () => router.replace("/admin/customers"))}
      />
    </div>
  )
}
