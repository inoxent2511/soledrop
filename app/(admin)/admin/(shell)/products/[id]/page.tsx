import { ExternalLink } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { adminButton } from "@/components/admin/button"
import { PageHeader } from "@/components/admin/page-header"
import { ProductEditor } from "@/features/admin/products/components/product-editor"
import { editorProps } from "@/features/admin/products/editor-data"
import { permissionPage } from "@/server/admin/dal"
import { staffCatalog } from "@/server/catalog"
import { isDomainError } from "@/server/shared/errors"

type Props = { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Edit product" }

export default async function EditProductPage({ params }: Props) {
  const { id } = await params
  const staff = await permissionPage("products:read", `/admin/products/${id}`)
  const detail = await staffCatalog()
    .getProduct(staff, id)
    .catch((error) => {
      if (isDomainError(error) && error.code === "not_found") notFound()
      throw error
    })
  const props = await editorProps(staff, detail)
  return (
    <>
      <PageHeader
        title={`${detail.product.brand.name} ${detail.product.title}`}
        crumbs={[{ label: "Products", href: "/admin/products" }]}
        actions={
          detail.product.status === "active" ? (
            <Link prefetch={false} href={`/products/${detail.product.slug}`} target="_blank" className={adminButton({ tone: "ghost", size: "sm" })}>
              <ExternalLink aria-hidden /> View in store
            </Link>
          ) : null
        }
      />
      {/* Keyed by version so a refresh after saving shows the stored values. */}
      <ProductEditor key={detail.updatedAt} {...props} />
    </>
  )
}
