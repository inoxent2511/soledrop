import type { Metadata } from "next"

import { PageHeader } from "@/components/admin/page-header"
import { CollectionEditor } from "@/features/admin/collections/components/collection-editor"
import { permissionPage } from "@/server/admin/dal"

export const metadata: Metadata = { title: "New collection" }

export default async function NewCollectionPage() {
  await permissionPage("collections:write", "/admin/collections/new")
  return (
    <>
      <PageHeader title="New collection" crumbs={[{ label: "Collections", href: "/admin/collections" }]} />
      <CollectionEditor canWrite initial={{ title: "", slug: "", headline: ["", ""], description: "", kind: "manual", rules: [], seo: {}, products: [] }} />
    </>
  )
}
