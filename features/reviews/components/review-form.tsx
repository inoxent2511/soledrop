"use client"

import { useState, type FormEvent } from "react"
import { Star } from "lucide-react"

export function ReviewForm({ products }: { products: { id: string; title: string }[] }) {
  const [rating, setRating] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [files, setFiles] = useState<string[]>([])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!rating) { setError("Choose a star rating first."); return }
    setBusy(true); setError(""); setMessage("")
    const form = event.currentTarget
    try {
      const data = new FormData(form)
      data.set("rating", String(rating))
      const response = await fetch("/api/reviews", { method: "POST", body: data })
      const result = await response.json() as { message?: string; error?: { message?: string } }
      if (!response.ok) throw new Error(result.error?.message ?? "Your review couldn't be sent. Please try again.")
      form.reset(); setRating(0); setFiles([])
      setMessage("Thank you! Your review was sent and will appear after our team checks it.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your review couldn't be sent. Please try again.") }
    finally { setBusy(false) }
  }

  const field = "min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-16 text-foreground outline-none focus:border-foreground focus:ring-2 focus:ring-brand"
  return <form method="post" onSubmit={(event) => void submit(event)} className="grid gap-5" encType="multipart/form-data">
    <div><p className="mb-2 text-16 font-bold">Your rating <span className="text-red-600">*</span></p>
      <div role="radiogroup" aria-label="Your rating" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((value) => <label key={value} className="cursor-pointer p-1">
          <input type="radio" name="ratingChoice" value={value} checked={rating === value} onChange={() => setRating(value)} className="sr-only peer" required />
          <Star aria-hidden className={`size-8 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${value <= rating ? "fill-brand text-brand" : "text-subtle-foreground hover:text-brand"}`} />
          <span className="sr-only">{value} stars</span>
        </label>)}
      </div>
    </div>
    <div className="grid gap-5 md:grid-cols-2">
      <label className="grid gap-2 text-16 font-bold">Display name <input className={field} name="displayName" required minLength={2} maxLength={80} autoComplete="name" /></label>
      <label className="grid gap-2 text-16 font-bold">Email (never shown publicly) <input className={field} name="email" type="email" required maxLength={254} autoComplete="email" /></label>
    </div>
    <label className="grid gap-2 text-16 font-bold">Review about <select className={field} name="productId" defaultValue=""><option value="">Sole Drop store experience</option>{products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}</select></label>
    <label className="grid gap-2 text-16 font-bold">Title <input className={field} name="title" required minLength={3} maxLength={120} placeholder="Sum up your experience" /></label>
    <label className="grid gap-2 text-16 font-bold">Your review <textarea className={`${field} min-h-36 resize-y`} name="body" required minLength={20} maxLength={3000} placeholder="Tell other shoppers what you liked and how the pair worked for you" /></label>
    <label className="grid gap-2 text-16 font-bold">Add photos (optional, up to 3) <input className={`${field} file:me-4 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2 file:font-bold`} name="images" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(event) => { const selected = Array.from(event.currentTarget.files ?? []); setFiles(selected.map((file) => file.name)); setError(selected.length > 3 || selected.some((file) => file.size > 5 * 1024 * 1024) ? "Choose up to three images, each under 5 MB." : "") }} />
      <span className="text-14 font-normal text-faint-foreground">JPEG, PNG, WebP or AVIF. We remove image metadata before publishing. {files.length ? `${files.length} selected.` : ""}</span></label>
    <div className="hidden" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <p className="text-14 text-faint-foreground">Your display name, rating, review and selected photos may appear publicly after moderation. Your email stays private.</p>
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-16 text-red-800">{error}</p> : null}
    {message ? <p role="status" className="rounded-lg bg-brand p-3 text-16 font-semibold text-brand-foreground">{message}</p> : null}
    <button disabled={busy} type="submit" className="min-h-13 rounded-xl bg-foreground px-7 text-16 font-extrabold text-background disabled:opacity-50 md:w-fit">{busy ? "Sending…" : "Submit review"}</button>
  </form>
}
