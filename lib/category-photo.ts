/** Older category artwork was saved before the image and caption were separate. */
const previousCategoryArtwork = new Set([
  "/images/site/category-brand-new.png",
  "/images/site/category-pre-loved.png",
  "/media/ad168ec8-e016-41b2-92b3-ad3f4dbe9adb.webp",
  "/media/a0116ebd-43d9-45f8-9c10-48c8b1114b43.webp",
])

export function usesDefaultCategoryPhoto(image: { src: string; mode?: string }, index: number) {
  return index < 2 && (image.mode === "full" || previousCategoryArtwork.has(image.src))
}
