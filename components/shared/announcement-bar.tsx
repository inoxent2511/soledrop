import { contentRepository } from "@/server/content"
import { currentStoreId } from "@/server/db/driver"

/** The lime strip above the header on Home. */
export async function AnnouncementBar() {
  const announcement = (await contentRepository().home(currentStoreId()))?.content.announcement
  if (!announcement) return null
  return (
    <p className="flex min-h-11.5 items-center justify-center bg-brand px-5 py-2 text-center text-14 font-bold wrap-anywhere text-brand-foreground md:text-18">
      {announcement}
    </p>
  )
}
