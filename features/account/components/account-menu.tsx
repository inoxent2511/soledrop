"use client"

import { Popover } from "@base-ui/react/popover"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { UserIcon } from "@/components/icons"
import { buttonVariants } from "@/components/ui/button-variants"
import { useAccount, useLogout } from "@/hooks/api/account/queries"
import { useRouteState } from "@/hooks/use-route-state"
import { cn } from "@/lib/utils"

const item = "flex min-h-11 items-center rounded-md px-3 text-16 font-semibold transition-colors hover:bg-surface focus-visible:bg-surface"

const signedInLinks = [
  { label: "Orders", href: "/account#orders" },
  { label: "Returns & exchanges", href: "/returns" },
  { label: "Addresses", href: "/account#addresses" },
  { label: "Account settings", href: "/account#details" },
]

/**
 * Header account control (derived, D-040). Without JavaScript it is the /account link; with it,
 * a popover (hover intent or click): sign in / create account / track an order when signed out,
 * the shopper's name, orders, returns, addresses, settings and sign out when signed in.
 */
export function AccountMenu({ className }: { className: string }) {
  const [open, setOpen] = useRouteState(false)
  const router = useRouter()
  const { data, isPending } = useAccount()
  const logout = useLogout()
  const customer = data?.customer ?? null

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        openOnHover
        delay={120}
        closeDelay={200}
        nativeButton={false}
        render={<Link href="/account" onClick={(event) => event.preventDefault()} />}
        aria-label={customer ? `Account: ${customer.fullName}` : "Account"}
        className={className}
      >
        <UserIcon />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={18} collisionPadding={12} className="z-overlay">
          <Popover.Popup className="flex w-72 max-w-[calc(100vw-1.5rem)] flex-col gap-1 rounded-xl bg-background p-3 text-foreground shadow-card-lift outline-1 outline-border motion-safe:transition-[opacity,transform] motion-safe:duration-150 data-ending-style:opacity-0 data-starting-style:-translate-y-1 data-starting-style:opacity-0">
            {isPending ? (
              <div aria-busy="true" className="flex flex-col gap-2 p-2">
                <span className="h-5 w-2/3 animate-pulse rounded-xs bg-surface-sunken" />
                <span className="h-11 animate-pulse rounded-md bg-surface-sunken" />
              </div>
            ) : customer ? (
              <>
                <Popover.Title className="truncate px-3 pt-1 pb-2 text-18 font-extrabold">Hi, {customer.fullName.split(" ")[0]}</Popover.Title>
                <ul className="flex flex-col">
                  {signedInLinks.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} onClick={() => setOpen(false)} className={item}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={logout.isPending}
                  onClick={() =>
                    logout.mutate(undefined, {
                      onSuccess: () => {
                        setOpen(false)
                        router.refresh()
                      },
                    })
                  }
                  className={cn(item, "mt-1 border-t border-border pt-1 text-destructive disabled:opacity-50")}
                >
                  {logout.isPending ? "Signing out…" : "Sign out"}
                </button>
                {logout.isError ? (
                  <p role="alert" className="px-3 text-14 text-destructive">
                    {logout.error.message}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <Popover.Title className="px-3 pt-1 text-18 font-extrabold">Your account</Popover.Title>
                <Popover.Description className="px-3 pb-2 text-14 text-subtle-foreground">Track orders and check out faster.</Popover.Description>
                <Link href="/account/login" onClick={() => setOpen(false)} className={cn(buttonVariants({ tone: "brand", size: "card" }), "w-full")}>
                  Sign in
                </Link>
                <Link href="/account/register" onClick={() => setOpen(false)} className={cn(buttonVariants({ tone: "outline", size: "card" }), "w-full")}>
                  Create account
                </Link>
                <Link href="/orders/lookup" onClick={() => setOpen(false)} className={cn(item, "mt-1")}>
                  Track an order
                </Link>
              </>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
