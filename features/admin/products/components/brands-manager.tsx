"use client"

import Link from "next/link"
import { useState } from "react"

import { adminCatalogApi } from "@/api/admin/catalog"
import { ApiError } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import type { Brand } from "@/server/catalog/types"

export function BrandsManager({ initial, canWrite }: { initial: Brand[]; canWrite: boolean }) {
  const [brands, setBrands] = useState(initial)
  const [selected, setSelected] = useState<Brand | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return <>
    <AdminCard title="Catalogue brands" description="A brand can be removed once no products use it, including drafts and archived products. Change the brand on those products first.">
      {brands.length ? <ul className="divide-y divide-border">
        {brands.map((brand) => <li key={brand.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span className="text-16 font-semibold">{brand.name}</span>
          <div className="flex flex-wrap gap-2">
            <Link prefetch={false} href={`/admin/products?q=${encodeURIComponent(brand.name)}`} className={adminButton({ tone: "ghost", size: "sm" })}>View products</Link>
            {canWrite ? <button type="button" disabled={busy} onClick={() => { setError(null); setSelected(brand) }} className={adminButton({ tone: "danger", size: "sm" })} aria-label={`Delete ${brand.name} brand`}>Delete</button> : null}
          </div>
        </li>)}
      </ul> : <p className="text-16 text-subtle-foreground">No brands yet. Add one while editing a product.</p>}
    </AdminCard>
    <ConfirmDialog
      open={selected !== null}
      onOpenChange={(open) => { if (!open) { setSelected(null); setError(null) } }}
      title={`Delete ${selected?.name ?? "brand"}?`}
      consequence="This removes the brand from product forms and the storefront. Products using it must be changed to another brand first."
      confirmLabel="Delete brand"
      typeToConfirm={selected?.slug}
      reason="optional"
      pending={busy}
      error={error}
      onConfirm={({ reason }) => {
        if (!selected) return
        setBusy(true)
        setError(null)
        adminCatalogApi.deleteBrand(selected.id, reason)
          .then(() => { setBrands((current) => current.filter((brand) => brand.id !== selected.id)); setSelected(null) })
          .catch((failure) => setError(failure instanceof ApiError ? failure.message : "Could not delete this brand. Please try again."))
          .finally(() => setBusy(false))
      }}
    />
  </>
}
