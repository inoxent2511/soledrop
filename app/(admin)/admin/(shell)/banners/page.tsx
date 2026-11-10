import Link from "next/link"

import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { PageHeader } from "@/components/admin/page-header"
import { can, permissionPage } from "@/server/admin/dal"
import { staffCatalog } from "@/server/catalog"
import { collectionHref } from "@/server/storefront"

export default async function BannersPage() {
  const staff = await permissionPage("content:read", "/admin/banners")
  const collections = can(staff, "collections:read") ? await staffCatalog().collections(staff) : []
  return <>
    <PageHeader title="Banners & images" description="Change banner photos wherever they appear on the storefront. Upload photos directly in each editor or choose from Media." />
    <AdminCard title="Homepage" description="Main hero slideshow, announcement, category card photos and Instagram strip. Reorder, replace or remove images and edit their alt text.">
      <Link prefetch={false} href="/admin/content/home" className={adminButton({ tone: "primary" })}>Edit homepage banners</Link>
    </AdminCard>
    <AdminCard title="Page & collection banners" description="Each page uses its own collection banner. Updating an image here changes every route that displays that collection.">
      <ul className="flex flex-col divide-y divide-border">
        {collections.map((collection) => <li key={collection.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            {collection.image ? <>
              {/* eslint-disable-next-line @next/next/no-img-element -- admin banner preview */}
              <img src={collection.image.url} alt="" width={100} height={60} className="h-16 w-24 rounded-md bg-surface object-cover" />
            </> : null}
            <div><p className="text-16 font-bold">{collection.title}</p><p className="text-14 text-subtle-foreground">{collection.slug === "new-arrivals" ? "/new-arrivals · " : ""}{collectionHref(collection.slug)}</p></div>
          </div>
          <Link prefetch={false} href={`/admin/collections/${collection.id}`} className={adminButton({ tone: "secondary", size: "sm" })}>Edit {collection.title} banner</Link>
        </li>)}
      </ul>
      {!collections.length ? <p className="text-16 text-subtle-foreground">{can(staff, "collections:read") ? "Create a collection to add its page banner." : "Collection access is required to edit page banners."}</p> : null}
    </AdminCard>
    <AdminCard title="Product photos & featured drops" description="Product pages, cards, search results, shopping bags and the homepage featured drops use the product's own photos.">
      {can(staff, "products:read") ? <Link prefetch={false} href="/admin/products" className={adminButton({ tone: "secondary" })}>Manage product photos</Link> : null}
    </AdminCard>
  </>
}
