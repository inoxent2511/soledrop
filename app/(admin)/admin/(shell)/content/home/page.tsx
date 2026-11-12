import { PageHeader } from "@/components/admin/page-header"
import { HomeEditor } from "@/features/admin/content/components/home-editor"
import { can, permissionPage } from "@/server/admin/dal"
import { staffContent } from "@/server/content"
import { emptyHome } from "@/server/content/home-types"

export default async function AdminHomePage() {
  const staff = await permissionPage("content:read", "/admin/content/home")
  const home = await staffContent().home(staff)
  return <>
    <PageHeader title="Homepage banners" description="Upload finished hero and category banner images with all words included in the artwork." crumbs={[{ label: "Banners & images", href: "/admin/banners" }]} />
    <HomeEditor key={home?.updatedAt ?? "empty"} initial={home ?? { content: emptyHome, updatedAt: "" }} canPublish={can(staff, "content:publish")} canUpload={can(staff, "media:write")} />
  </>
}
