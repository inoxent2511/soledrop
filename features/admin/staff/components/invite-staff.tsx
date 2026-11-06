"use client"

import { Copy, UserPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { ApiError, request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { AdminField, AdminSelect } from "@/components/admin/form"
import { FormDialog } from "@/components/admin/form-dialog"
import { useStepUp } from "@/components/admin/step-up"

/** Invite a member: the one-time link is shown here to pass on (no email provider sends it yet). */
export function InviteStaff({ roles }: { roles: { key: string; name: string }[] }) {
  const id = useId()
  const router = useRouter()
  const withStepUp = useStepUp()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLink(null)
          setError(null)
          setCopied(false)
          setOpen(true)
        }}
        className={adminButton({ tone: "primary", size: "sm" })}
      >
        <UserPlus aria-hidden /> Invite
      </button>
      <FormDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next && link) router.refresh()
        }}
        title={link ? "Invite ready" : "Invite a team member"}
        description={link ? "Send this link to them privately. It works once and expires in 3 days; you won't see it again." : "They choose a password and set up two-step verification from the link."}
        submitLabel={link ? "Done" : "Create invite"}
        pending={pending}
        error={error}
        onSubmit={async (form) => {
          if (link) return setOpen(false)
          const data = new FormData(form)
          setPending(true)
          setError(null)
          try {
            const result = await withStepUp(() => request<{ path: string }>("/api/admin/staff/invites", { method: "POST", body: { email: String(data.get("email") ?? ""), roleKey: String(data.get("roleKey") ?? "") } }))
            setLink(new URL(result.path, window.location.origin).toString())
          } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : "The invite failed.")
          } finally {
            setPending(false)
          }
        }}
      >
        {link ? (
          <div className="flex flex-col gap-2">
            <code className="rounded-md bg-surface p-3 text-14 break-all select-all">{link}</code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(link).catch(() => null)
                setCopied(true)
              }}
              className={adminButton({ tone: "secondary", size: "sm" })}
            >
              <Copy aria-hidden /> {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        ) : (
          <>
            <AdminField formId={id} name="email" type="email" label="Their work email" autoComplete="off" />
            <AdminSelect formId={id} name="roleKey" label="Role">
              {roles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))}
            </AdminSelect>
          </>
        )}
      </FormDialog>
    </>
  )
}
