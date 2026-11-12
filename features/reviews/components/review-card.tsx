import Link from "next/link"
import { Star } from "lucide-react"

import type { Review } from "@/server/reviews"

export function ReviewStars({ rating, size = "normal" }: { rating: number; size?: "normal" | "large" }) {
  return <span role="img" aria-label={`${rating} out of 5 stars`} className="inline-flex gap-0.5 text-brand">
    {Array.from({ length: 5 }, (_, index) => <Star key={index} aria-hidden className={size === "large" ? "size-6" : "size-4"} fill={index < Math.round(rating) ? "currentColor" : "none"} />)}
  </span>
}

export function ReviewCard({ review, dark = false }: { review: Review; dark?: boolean }) {
  return <article className={`flex h-full flex-col overflow-hidden rounded-2xl border p-5 md:p-7 ${dark ? "border-white/20 bg-white/5 text-white" : "border-border bg-background shadow-card-lift"}`}>
    <div className="flex items-start justify-between gap-3">
      <ReviewStars rating={review.rating} />
      <time dateTime={review.createdAt} className={`text-14 ${dark ? "text-white/65" : "text-subtle-foreground"}`}>{new Date(review.createdAt).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })}</time>
    </div>
    <h3 className="mt-5 text-22 font-extrabold leading-tight">{review.title}</h3>
    <p className={`mt-3 grow text-16 leading-relaxed whitespace-pre-line ${dark ? "text-white/85" : "text-faint-foreground"}`}>{review.body}</p>
    {review.imageCount > 0 ? <div className="mt-5 grid grid-cols-3 gap-2">
      {Array.from({ length: review.imageCount }, (_, index) => <a key={index} href={`/review-images/${review.id}/${index}`} target="_blank" rel="noopener noreferrer" aria-label={`View image ${index + 1} from ${review.displayName}'s review`} className="block overflow-hidden rounded-lg bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element -- public review media is already optimized WebP */}
        <img src={`/review-images/${review.id}/${index}`} alt={`Customer photo ${index + 1} for ${review.productTitle ?? "Sole Drop"}`} loading="lazy" className="aspect-square w-full object-cover transition-transform hover:scale-105" />
      </a>)}
    </div> : null}
    <div className={`mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4 ${dark ? "border-white/15" : "border-border"}`}>
      <span className="text-14 font-bold">{review.displayName}</span>
      {review.productTitle && review.productId ? <span className={`text-14 ${dark ? "text-white/65" : "text-subtle-foreground"}`}>On {review.productTitle}</span> : <span className={`text-14 ${dark ? "text-white/65" : "text-subtle-foreground"}`}>Store review</span>}
    </div>
  </article>
}

export function ReviewHomeSection({ reviews, total, average }: { reviews: Review[]; total: number; average: number }) {
  return <section aria-labelledby="reviews-home-title" className="bg-foreground py-16 text-background md:py-22">
    <div className="mx-auto w-full max-w-screen-2xl px-5 md:px-10 xl:px-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div><p className="text-14 font-extrabold tracking-widest text-brand uppercase">From the Sole Drop community</p>
          <h2 id="reviews-home-title" className="mt-3 text-40 leading-none font-black uppercase md:text-54">Real pairs. Real stories.</h2>
          <p className="mt-4 max-w-2xl text-17 text-white/75">See what shoppers think of their pairs and their experience with us.</p></div>
        <Link href="/reviews" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-6 font-extrabold text-brand-foreground transition-transform hover:-translate-y-0.5">Explore customer reviews →</Link>
      </div>
      {total > 0 ? <p className="mt-8 flex items-center gap-3 text-16"><ReviewStars rating={average} /><strong>{average.toFixed(1)} / 5</strong><span className="text-white/65">from {total} approved {total === 1 ? "review" : "reviews"}</span></p> : null}
      {reviews.length ? <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{reviews.slice(0, 3).map((review) => <ReviewCard key={review.id} review={review} dark />)}</div>
        : <div className="mt-8 rounded-2xl border border-white/20 p-7 text-white/80">Be the first to share your Sole Drop experience. Reviews appear after our team checks them.</div>}
    </div>
  </section>
}
