import type { Metadata } from "next"

import { PageHeader } from "@/components/admin/page-header"
import { MediaLibrary } from "@/features/admin/media/components/media-library"
import { can, permissionPage } from "@/server/admin/dal"

export const metadata: Metadata = { title: "Media" }

export default async function AdminMediaPage() {
  const staff = await permissionPage("media:read", "/admin/media")
  return (
    <>
      <PageHeader title="Media" description="Product photos and images. Uploads are checked and saved as WebP; photos in use by a product can't be deleted." />
      <MediaLibrary canWrite={can(staff, "media:write")} />
    </>
  )
}
