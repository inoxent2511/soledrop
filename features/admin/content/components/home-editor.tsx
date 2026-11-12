"use client"

import { useId, useState } from "react"

import { ApiError, request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { AdminField, AdminTextarea, FormAlert } from "@/components/admin/form"
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
    const parsed = homeInput.safeParse({ ...form, slides: form.slides.map(({ src, alt, width, height }) => ({ src, alt, width, height })) })
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
    return <AdminCard title={kind === "slides" ? "Homepage hero photos" : title} description={kind === "slides" ? "Replace the shoe photos on the right of the homepage hero. The saved heading, description and buttons stay in place." : "Choose library photos or upload new ones. Remove every photo to hide this section."}>
      <div className="flex flex-col gap-4">
        {rows.map((image, index) => <div key={`${image.src}-${index}`} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin library preview */}
          <img src={image.src} alt="" width={120} height={90} className="h-24 w-32 rounded-md bg-surface object-contain" />
          <div className="min-w-0 flex-1"><AdminField formId={id} name={`${kind}-${index}`} label={`${title} photo ${index + 1} alt text`} value={image.alt} maxLength={300} onChange={(event) => setImages(kind, rows.map((row, at) => at === index ? { ...row, alt: event.target.value } : row))} /></div>
          <button type="button" className={adminButton({ tone: "secondary", size: "sm" })} onClick={() => { setReplacement({ kind, index }); setPicker(kind) }} aria-label={`Replace ${title.toLowerCase()} photo ${index + 1}`}>Replace</button>
          <button type="button" disabled={index === 0} className={adminButton({ tone: "secondary", size: "sm" })} onClick={() => { const next = [...rows]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setImages(kind, next) }} aria-label={`Move ${title.toLowerCase()} photo ${index + 1} up`}>Up</button>
          <button type="button" className={adminButton({ tone: "ghost", size: "sm" })} onClick={() => setImages(kind, rows.filter((_, at) => at !== index))} aria-label={`Remove ${title.toLowerCase()} photo ${index + 1}`}>Remove</button>
        </div>)}
        <button type="button" disabled={rows.length >= max} onClick={() => setPicker(kind)} className={adminButton({ tone: "secondary" })}>{kind === "slides" ? "Add hero photo" : `Add ${title.toLowerCase()} photos`}</button>
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
      <AdminCard title="Homepage hero text & buttons" description="These words and links stay on the left while you replace the hero photos.">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">{form.heading.map((line, index) => <AdminField key={index} formId={id} name={`heading-${index}`} label={`Heading line ${index + 1}`} value={line} maxLength={30} onChange={(event) => update({ heading: form.heading.map((text, at) => at === index ? event.target.value : text) as HomeContent["heading"] })} />)}</div>
          <AdminTextarea formId={id} name="description" label="Hero description" value={form.description} maxLength={600} onChange={(event) => update({ description: event.target.value })} />
          {form.buttons.map((button, index) => <div key={index} className="grid gap-3 sm:grid-cols-2">
            <AdminField formId={id} name={`button-${index}`} label={`Button ${index + 1} label`} value={button.label} maxLength={40} onChange={(event) => update({ buttons: form.buttons.map((row, at) => at === index ? { ...row, label: event.target.value } : row) })} />
            <AdminField formId={id} name={`button-link-${index}`} label={`Button ${index + 1} link`} value={button.href} onChange={(event) => update({ buttons: form.buttons.map((row, at) => at === index ? { ...row, href: event.target.value } : row) })} />
            <button type="button" className={adminButton({ tone: "ghost", size: "sm" })} onClick={() => update({ buttons: form.buttons.filter((_, at) => at !== index) })}>Remove button {index + 1}</button>
          </div>)}
          {form.buttons.length < 2 ? <button type="button" className={adminButton({ tone: "secondary" })} onClick={() => update({ buttons: [...form.buttons, { label: "Shop", href: "/new-arrivals" }] })}>Add button</button> : null}
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
        const photo = { src: item.url, alt: item.alt, width: item.width, height: item.height }
        const artwork = { ...photo, mode: "full" as const }
        if (replacement) {
          if (replacement.kind === "category") return { ...current, categories: current.categories.map((row, at) => at === replacement.index ? { ...row, image: artwork } : row) }
          if (replacement.kind === "slides") return { ...current, slides: current.slides.map((row, at) => at === replacement.index ? photo : row) }
          return { ...current, instagram: { ...current.instagram, images: current.instagram.images.map((row, at) => at === replacement.index ? { src: item.url, alt: item.alt } : row) } }
        }
        if (picker === "slides" && current.slides.length < 10 && !current.slides.some((row) => row.src === item.url)) return { ...current, slides: [...current.slides, photo] }
        if (picker === "instagram" && current.instagram.images.length < 12 && !current.instagram.images.some((row) => row.src === item.url)) return { ...current, instagram: { ...current.instagram, images: [...current.instagram.images, { src: item.url, alt: item.alt }] } }
        if (picker === "category" && current.categories.length < 8) return { ...current, categories: [...current.categories, { title: ["Shop", "Now"], href: "/new-arrivals", image: artwork }] }
        return current
      })
      if (replacement) { setPicker(null); setReplacement(null) }
    }} />
  </div>
}
