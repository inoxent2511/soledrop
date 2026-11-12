"use client"

import { useId, useState } from "react"

import { ApiError, request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { AdminField, FormAlert } from "@/components/admin/form"
import { homeInput } from "@/features/admin/content/home-schema"
import { MediaPicker } from "@/features/admin/media/components/media-library"
import type { HomeContent, HomeImage, HomeRecord } from "@/server/content/home-types"

export function HomeEditor({ initial, canPublish, canUpload }: { initial: HomeRecord; canPublish: boolean; canUpload: boolean }) {
  const id = useId()
  const [form, setForm] = useState(initial.content)
  const [version, setVersion] = useState<string | null>(initial.updatedAt || null)
  const [picker, setPicker] = useState<"slides" | "instagram" | "category" | null>(null)
  const [replacement, setReplacement] = useState<{ kind: "slides" | "instagram" | "category"; index: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const update = (changes: Partial<HomeContent>) => { setSaved(false); setForm((value) => ({ ...value, ...changes })) }
  const images = (kind: "slides" | "instagram") => kind === "slides" ? form.slides : form.instagram.images
  const setImages = (kind: "slides" | "instagram", rows: HomeImage[]) => update(kind === "slides" ? { slides: rows } : { instagram: { ...form.instagram, images: rows } })

  async function save() {
    const parsed = homeInput.safeParse(form)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Please check the form.")
    setBusy(true); setError(null); setSaved(false)
    try {
      const result = await request<HomeRecord>("/api/admin/content/home", { method: "PUT", body: { content: parsed.data, expectedUpdatedAt: version } })
      setForm(result.content); setVersion(result.updatedAt); setSaved(true)
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : "Could not save. Please try again.") }
    finally { setBusy(false) }
  }

  function photoList(kind: "slides" | "instagram", title: string, max: number) {
    const rows = images(kind)
    return <AdminCard title={kind === "slides" ? "Homepage hero banners" : title} description={kind === "slides" ? "Upload finished banner artwork with all words inside the image. The full image appears without text or buttons over it. Add more images for a slideshow. Keep important words readable on phones." : "Choose library photos or upload new ones. Remove every photo to hide this section."}>
      <div className="flex flex-col gap-4">
        {rows.map((image, index) => <div key={`${image.src}-${index}`} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin library preview */}
          <img src={image.src} alt="" width={120} height={90} className="h-24 w-32 rounded-md bg-surface object-contain" />
          <div className="min-w-0 flex-1"><AdminField formId={id} name={`${kind}-${index}`} label={kind === "slides" ? `Banner ${index + 1} image description (screen readers)` : `${title} photo ${index + 1} alt text`} value={image.alt} maxLength={300} onChange={(event) => setImages(kind, rows.map((row, at) => at === index ? { ...row, alt: event.target.value } : row))} />
            {kind === "slides" ? <AdminField formId={id} name={`slide-link-${index}`} label="Banner destination link (optional)" value={image.href ?? ""} onChange={(event) => setImages(kind, rows.map((row, at) => at === index ? { ...row, href: event.target.value || undefined } : row))} /> : null}
            {kind === "slides" && image.mode !== "full" ? <p className="text-14 text-subtle-foreground">Legacy banner: replace this photo with complete artwork to remove the separate headline and buttons.</p> : null}
          </div>
          <button type="button" className={adminButton({ tone: "secondary", size: "sm" })} onClick={() => { setReplacement({ kind, index }); setPicker(kind) }} aria-label={`Replace ${title.toLowerCase()} photo ${index + 1}`}>Replace</button>
          <button type="button" disabled={index === 0} className={adminButton({ tone: "secondary", size: "sm" })} onClick={() => { const next = [...rows]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setImages(kind, next) }} aria-label={`Move ${title.toLowerCase()} photo ${index + 1} up`}>Up</button>
          <button type="button" className={adminButton({ tone: "ghost", size: "sm" })} onClick={() => setImages(kind, rows.filter((_, at) => at !== index))} aria-label={`Remove ${title.toLowerCase()} photo ${index + 1}`}>Remove</button>
        </div>)}
        <button type="button" disabled={rows.length >= max} onClick={() => setPicker(kind)} className={adminButton({ tone: "secondary" })}>{kind === "slides" ? "Upload or choose complete banner image" : `Add ${title.toLowerCase()} photos`}</button>
      </div>
    </AdminCard>
  }

  return <div className="flex flex-col gap-5">
    <fieldset disabled={!canPublish || busy} className="flex min-w-0 flex-col gap-5">
      <AdminCard title="Announcement strip" description="The announcement above the navigation is separate from the image banners.">
        <div className="flex flex-col gap-4">
          <AdminField formId={id} name="announcement" label="Announcement" value={form.announcement} maxLength={300} onChange={(event) => update({ announcement: event.target.value })} />
        </div>
      </AdminCard>
      {photoList("slides", "Hero", 10)}
      <AdminCard title="Category banners" description="Upload each complete category image with its words included. The image links to the destination below; no title or button is placed over new artwork.">
        <div className="flex flex-col gap-4">
          {form.categories.map((category, index) => <div key={index} className="flex flex-col gap-3 rounded-md border border-border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- admin library preview */}
            <img src={category.image.src} alt="" width={120} height={90} className="h-24 w-32 rounded-md bg-surface object-contain" />
            {category.image.mode !== "full" ? <p className="text-14 text-subtle-foreground">Legacy card: replace this photo with complete artwork to remove the overlaid title and button.</p> : null}
            <AdminField formId={id} name={`category-link-${index}`} label={`Category ${index + 1} link`} value={category.href} onChange={(event) => update({ categories: form.categories.map((row, at) => at === index ? { ...row, href: event.target.value } : row) })} />
            <AdminField formId={id} name={`category-alt-${index}`} label={`Category ${index + 1} image description (screen readers)`} value={category.image.alt} onChange={(event) => update({ categories: form.categories.map((row, at) => at === index ? { ...row, image: { ...row.image, alt: event.target.value } } : row) })} />
            <button type="button" onClick={() => { setReplacement({ kind: "category", index }); setPicker("category") }} className={adminButton({ tone: "secondary" })}>Replace category {index + 1} banner</button>
            <button type="button" onClick={() => update({ categories: form.categories.filter((_, at) => at !== index) })} className={adminButton({ tone: "ghost" })}>Remove category {index + 1}</button>
          </div>)}
          <button type="button" disabled={form.categories.length >= 8} onClick={() => setPicker("category")} className={adminButton({ tone: "secondary" })}>Add complete category banner</button>
        </div>
      </AdminCard>
      <AdminCard title="Instagram profile"><div className="flex flex-col gap-4">
        <AdminField formId={id} name="instagram-handle" label="Instagram handle" value={form.instagram.handle} onChange={(event) => update({ instagram: { ...form.instagram, handle: event.target.value } })} />
        <AdminField formId={id} name="instagram-link" label="Instagram profile link" value={form.instagram.href} onChange={(event) => update({ instagram: { ...form.instagram, href: event.target.value } })} />
      </div></AdminCard>
      {photoList("instagram", "Instagram", 12)}
    </fieldset>
    <FormAlert>{error}</FormAlert>
    {saved ? <p role="status" className="text-16 text-success-foreground">Homepage saved and published.</p> : null}
    {canPublish ? <button type="button" disabled={busy} onClick={() => void save()} className={adminButton({ tone: "primary" })}>{busy ? "Saving…" : "Save & publish homepage"}</button> : <p className="text-16 text-subtle-foreground">Publishing permission is required to change the homepage.</p>}
    <MediaPicker open={picker !== null} onOpenChange={(open) => { if (!open) { setPicker(null); setReplacement(null) } }} chosen={[]} canUpload={canUpload && canPublish} onPick={(item) => {
      if (!canPublish || busy) return
      setSaved(false)
      setForm((current) => {
        const image = { src: item.url, alt: item.alt, width: item.width, height: item.height, mode: "full" as const }
        if (replacement) {
          if (replacement.kind === "category") return { ...current, categories: current.categories.map((row, at) => at === replacement.index ? { ...row, image } : row) }
          if (replacement.kind === "slides") return { ...current, slides: current.slides.map((row, at) => at === replacement.index ? { ...image, href: row.href } : row).filter((row) => row.mode === "full") }
          return { ...current, instagram: { ...current.instagram, images: current.instagram.images.map((row, at) => at === replacement.index ? { src: item.url, alt: item.alt } : row) } }
        }
        if (picker === "slides" && !current.slides.some((row) => row.src === item.url)) return { ...current, slides: [...current.slides.filter((row) => row.mode === "full"), image].slice(0, 10) }
        if (picker === "instagram" && current.instagram.images.length < 12 && !current.instagram.images.some((row) => row.src === item.url)) return { ...current, instagram: { ...current.instagram, images: [...current.instagram.images, { src: item.url, alt: item.alt }] } }
        if (picker === "category" && current.categories.length < 8) return { ...current, categories: [...current.categories, { title: ["Shop", "Now"], href: "/new-arrivals", image }] }
        return current
      })
      if (replacement) { setPicker(null); setReplacement(null) }
    }} />
  </div>
}
