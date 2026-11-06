"use client"

import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { ApiError, request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { AdminField, FormAlert } from "@/components/admin/form"
import { PermissionMatrix, type PermissionCatalog } from "@/components/admin/permission-matrix"
import { useStepUp } from "@/components/admin/step-up"

type Role = { key?: string; name: string; description: string; refundLimit: number | null; permissions: string[]; isSystem: boolean; updatedAt?: string }

/** Create or edit a custom role; system roles are shown read-only. */
export function RoleEditor({ role, catalog, canManage, grantable }: { role: Role; catalog: PermissionCatalog; canManage: boolean; grantable: string[] }) {
  const id = useId()
  const router = useRouter()
  const withStepUp = useStepUp()
  const [name, setName] = useState(role.name)
  const [description, setDescription] = useState(role.description)
  const [limit, setLimit] = useState(role.refundLimit === null ? "" : String(role.refundLimit / 100))
  const [selected, setSelected] = useState(new Set(role.permissions))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const readOnly = role.isSystem || !canManage

  async function run(work: () => Promise<unknown>, after: () => void) {
    setBusy(true)
    setError(null)
    try {
      await withStepUp(work)
      after()
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "That didn't save. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const body = () => ({ name, description, refundLimit: limit.trim() === "" ? null : Math.round(Number(limit) * 100), permissions: [...selected], expectedUpdatedAt: role.updatedAt })

  return (
    <div className="flex flex-col gap-6">
      <AdminCard title="Role" description={role.isSystem ? "A built-in role: it can't be changed or deleted. Create a custom role for a different mix." : undefined}>
        <fieldset disabled={readOnly} className="grid gap-4 md:grid-cols-3">
          <AdminField formId={id} name="name" label="Name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
          <AdminField formId={id} name="description" label="What it's for" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} />
          <AdminField formId={id} name="limit" label="Refund limit per refund (Rs.)" hint="Empty: no limit." inputMode="decimal" value={limit} onChange={(event) => setLimit(event.target.value)} />
        </fieldset>
      </AdminCard>
      <AdminCard title="Permissions" description="⚑ sensitive: needs a fresh authenticator code each time. Greyed-out ones are beyond your own access, so you can't grant them.">
        <PermissionMatrix catalog={catalog} selected={selected} onChange={setSelected} disabled={readOnly} allowed={new Set(grantable)} />
      </AdminCard>
      <FormAlert>{error}</FormAlert>
      {!readOnly ? (
        <div className="flex flex-wrap justify-between gap-2">
          {role.key ? (
            <button type="button" disabled={busy} onClick={() => void run(() => request(`/api/admin/roles/${role.key}`, { method: "DELETE" }), () => router.replace("/admin/staff/roles"))} className={adminButton({ tone: "ghost" })}>
              Delete role
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                () => (role.key ? request(`/api/admin/roles/${role.key}`, { method: "PUT", body: body() }) : request<{ role: { key: string } }>("/api/admin/roles", { method: "POST", body: body() })),
                () => (role.key ? router.refresh() : router.replace("/admin/staff/roles")),
              )
            }
            className={adminButton({ tone: "primary" })}
          >
            {busy ? "Saving…" : role.key ? "Save role" : "Create role"}
          </button>
        </div>
      ) : null}
    </div>
  )
}
