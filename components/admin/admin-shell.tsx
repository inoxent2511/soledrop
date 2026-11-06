"use client"

import { Dialog } from "@base-ui/react/dialog"
import { LogOut, Menu, Store, UserRound, X } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"

import { adminAuthApi } from "@/api/admin/auth"
import { adminButton } from "@/components/admin/button"
import { StepUpProvider } from "@/components/admin/step-up"
import { ADMIN_MODULES, moduleFor, type AdminModule } from "@/features/admin/modules"
import { cn } from "@/lib/utils"

export type ShellStaff = { displayName: string; email: string; roles: string[]; permissions: string[] }

const GROUPS: AdminModule["group"][] = ["Overview", "Sales", "Catalogue", "Marketing", "Content", "Money", "Setup"]

function Nav({ permissions, onNavigate }: { permissions: string[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  const current = moduleFor(pathname)
  const visible = ADMIN_MODULES.filter((module) => permissions.includes(module.permission))
  return (
    <nav aria-label="Admin" className="flex flex-col gap-5 px-3 py-4">
      {GROUPS.map((group) => {
        const modules = visible.filter((module) => module.group === group)
        if (modules.length === 0) return null
        return (
          <div key={group} className="flex flex-col gap-1">
            {group !== "Overview" ? <p className="px-3 text-14 font-semibold text-faint-foreground uppercase">{group}</p> : null}
            <ul className="flex flex-col gap-0.5">
              {modules.map((module) => {
                const active = current?.key === module.key
                const Icon = module.icon
                return (
                  <li key={module.key}>
                    <Link
                      href={module.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-10 items-center gap-3 rounded-md px-3 text-16 font-semibold transition-colors",
                        active ? "bg-brand text-brand-foreground" : "text-background hover:bg-ink-raised",
                      )}
                    >
                      <Icon aria-hidden className="size-4.5 shrink-0" />
                      {module.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

function Brand() {
  return (
    <Link href="/admin" className="flex h-16 items-center gap-2 px-6 font-display text-20 font-extrabold text-background">
      Sole Drop <span className="rounded-sm bg-brand px-1.5 text-14 text-brand-foreground uppercase">Admin</span>
    </Link>
  )
}

/**
 * The admin frame (admin-design.md, "Layout"): the module sidebar filtered by the staff member's
 * permissions (a drawer below `lg`), the top bar with the account menu, and the content area.
 * Hiding a module is a convenience only; each page and handler checks on the server.
 */
export function AdminShell({ staff, children }: { staff: ShellStaff; children: ReactNode }) {
  const [drawer, setDrawer] = useState(false)
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    await adminAuthApi.logout().catch(() => null)
    router.replace("/admin/login")
    router.refresh()
  }

  return (
    <StepUpProvider>
      <div className="flex min-h-dvh bg-surface print:bg-background">
        <aside className="sticky top-0 hidden h-dvh print:hidden w-64 shrink-0 flex-col overflow-y-auto bg-foreground lg:flex">
          <Brand />
          <Nav permissions={staff.permissions} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-nav flex h-16 print:hidden items-center gap-2 border-b border-border bg-background px-4 md:px-6">
            <Dialog.Root open={drawer} onOpenChange={setDrawer}>
              <Dialog.Trigger className={cn(adminButton({ tone: "ghost", size: "icon" }), "lg:hidden")} aria-label="Open the admin menu">
                <Menu />
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-overlay bg-foreground/60 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
                <Dialog.Popup className="fixed inset-y-0 start-0 z-overlay flex w-72 max-w-full flex-col overflow-y-auto bg-foreground transition-transform data-ending-style:-translate-x-full data-starting-style:-translate-x-full rtl:data-ending-style:translate-x-full rtl:data-starting-style:translate-x-full">
                  <div className="flex items-center justify-between pe-2">
                    <Dialog.Title render={<div />}>
                      <Brand />
                    </Dialog.Title>
                    <Dialog.Close className={cn(adminButton({ tone: "ghost", size: "icon" }), "text-background hover:bg-ink-raised")} aria-label="Close the admin menu">
                      <X />
                    </Dialog.Close>
                  </div>
                  <Nav permissions={staff.permissions} onNavigate={() => setDrawer(false)} />
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>

            <div className="flex-1" />

            <Link href="/" className={adminButton({ tone: "ghost", size: "sm" })} target="_blank" rel="noopener">
              <Store aria-hidden /> <span className="hidden sm:inline">View store</span>
            </Link>
            <Link href="/admin/account" className={cn(adminButton({ tone: "ghost", size: "sm" }), "max-w-60")}>
              <UserRound aria-hidden />
              <span className="hidden truncate md:inline">{staff.displayName}</span>
            </Link>
            <button type="button" onClick={() => void signOut()} disabled={signingOut} className={adminButton({ tone: "ghost", size: "sm" })}>
              <LogOut aria-hidden /> <span className="hidden sm:inline">{signingOut ? "Signing out…" : "Sign out"}</span>
            </button>
          </header>

          <main id="main" tabIndex={-1} className="flex w-full max-w-screen-2xl flex-1 flex-col gap-6 px-4 py-5 outline-none md:px-6 md:py-6">
            {children}
          </main>
        </div>
      </div>
    </StepUpProvider>
  )
}
