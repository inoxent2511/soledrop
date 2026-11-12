"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import type { Review } from "@/server/reviews"

export function AdminReviewList({ reviews, canWrite }: { reviews: Review[]; canWrite: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")

  async function act(id: string, action: "approve" | "reject" | "feature" | "unfeature") {
    setBusy(id); setError("")
    try {
      const response = await fetch(`/api/admin/reviews/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) })
      const body = await response.json() as { error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message ?? "The review couldn't be updated.")
      router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The review couldn't be updated.") }
    finally { setBusy(null) }
  }

  if (!reviews.length) return <p className="rounded-xl border border-border bg-background p-8 text-16">No reviews in this view.</p>
  return <div className="grid gap-4">
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p> : null}
    {reviews.map((review) => <article key={review.id} className="rounded-xl border border-border bg-background p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-14 font-bold text-faint-foreground">{review.productTitle ?? "Store review"} · {new Date(review.createdAt).toLocaleDateString("en-PK")}</p>
        <h2 className="mt-2 text-22 font-extrabold">{review.title}</h2><p className="mt-1 text-16 font-bold">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)} <span className="ms-2 font-normal">by {review.displayName}</span></p></div>
        <span className={`rounded-full px-3 py-1 text-14 font-bold uppercase ${review.status === "approved" ? "bg-brand" : review.status === "pending" ? "bg-yellow-100" : "bg-surface"}`}>{review.status}{review.featured ? " · Featured" : ""}</span></div>
      <p className="mt-4 whitespace-pre-line text-16 leading-relaxed">{review.body}</p>
      {review.imageCount ? <div className="mt-4 flex flex-wrap gap-2">{Array.from({ length: review.imageCount }, (_, index) => <a href={`/api/admin/reviews/${review.id}/images/${index}`} key={index} target="_blank" rel="noopener noreferrer" aria-label={`Open review image ${index + 1}`} className="block overflow-hidden rounded-lg border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element -- private moderation image route */}
        <img src={`/api/admin/reviews/${review.id}/images/${index}`} alt={`Customer upload ${index + 1}`} className="size-24 object-cover" />
      </a>)}</div> : null}
      {canWrite ? <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        {review.status !== "approved" ? <button disabled={busy === review.id} onClick={() => void act(review.id, "approve")} className="min-h-10 rounded-lg bg-brand px-4 font-bold disabled:opacity-50">Approve</button> : null}
        {review.status !== "rejected" ? <button disabled={busy === review.id} onClick={() => void act(review.id, "reject")} className="min-h-10 rounded-lg border border-border px-4 font-bold disabled:opacity-50">{review.status === "approved" ? "Hide review" : "Reject"}</button> : null}
        {review.status === "approved" ? <button disabled={busy === review.id} onClick={() => void act(review.id, review.featured ? "unfeature" : "feature")} className="min-h-10 rounded-lg border border-border px-4 font-bold disabled:opacity-50">{review.featured ? "Remove from homepage" : "Feature on homepage"}</button> : null}
      </div> : null}
    </article>)}
  </div>
}
