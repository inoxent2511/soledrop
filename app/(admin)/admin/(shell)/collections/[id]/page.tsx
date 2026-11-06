import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/admin/page-header"
import { CollectionEditor } from "@/features/admin/collections/components/collection-editor"
import { can, permissionPage } from "@/server/admin/dal"
import { staffCatalog } from "@/server/catalog"
import { isDomainError } from "@/server/shared/errors"

type Props = { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Edit collection" }

export default async function EditCollectionPage({ params }: Props) {
  const { id } = await params
  const staff = await permissionPage("collections:read", `/admin/collections/${id}`)
  const { collection, productIds, products } = await staffCatalog()
    .collection(staff, id)
    .catch((error) => {
      if (isDomainError(error) && error.code === "not_found") notFound()
      throw error
    })
  return (
    <>
      <PageHeader title={collection.title} crumbs={[{ label: "Collections", href: "/admin/collections" }]} />
      <CollectionEditor
        key={JSON.stringify([collection, productIds])}
        canWrite={can(staff, "collections:write")}
        canUpload={can(staff, "media:write")}
        initial={{ id: collection.id, title: collection.title, slug: collection.slug, headline: collection.headline, description: collection.description, kind: collection.kind, rules: collection.rules ?? [], seo: collection.seo, products, image: collection.image }}
      />
    </>
  )
}
