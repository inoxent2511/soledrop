"use client"

/** The registry as the matrix shows it: groups of permissions (built on the server, server/admin/permissions.ts). */
export type PermissionCatalog = { group: string; permissions: { key: string; label: string; sensitive: boolean }[] }[]

/**
 * The permission grid for one role, grouped as the registry groups them (admin-design.md,
 * PermissionMatrix). Read-only for system roles; ⚑ marks sensitive permissions (step-up).
 * `allowed` greys out permissions the editor can't grant (no privilege escalation).
 */
export function PermissionMatrix({ catalog, selected, onChange, disabled, allowed }: { catalog: PermissionCatalog; selected: Set<string>; onChange?: (next: Set<string>) => void; disabled?: boolean; allowed?: Set<string> }) {
  const toggle = (permission: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(permission)
    else next.delete(permission)
    onChange?.(next)
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {catalog.map(({ group, permissions }) => (
        <fieldset key={group} disabled={disabled} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
          <legend className="px-1 text-14 font-bold">{group}</legend>
          {permissions.map((permission) => {
            const blocked = allowed !== undefined && !allowed.has(permission.key) && !selected.has(permission.key)
            return (
              <label key={permission.key} className="flex items-start gap-2 text-14">
                <input type="checkbox" checked={selected.has(permission.key)} disabled={disabled || blocked} onChange={(event) => toggle(permission.key, event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-foreground" />
                <span>
                  {permission.label}
                  {permission.sensitive ? <span title="Needs a fresh authenticator code"> ⚑</span> : null}
                  <code className="block text-14 text-faint-foreground">{permission.key}</code>
                </span>
              </label>
            )
          })}
        </fieldset>
      ))}
    </div>
  )
}
