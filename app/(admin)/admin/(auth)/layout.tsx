/** Sign-in, MFA and invite screens: one card on the admin canvas. */
export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-foreground px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-lg bg-background p-6 md:p-8">
        <p className="flex items-center gap-2 font-display text-20 font-extrabold">
          Sole Drop <span className="rounded-sm bg-brand px-1.5 text-14 text-brand-foreground uppercase">Admin</span>
        </p>
        {children}
      </div>
    </main>
  )
}
