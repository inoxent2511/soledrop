import type { Metadata } from "next"
import Link from "next/link"

import { Container } from "@/components/shared/container"
import { ReviewCard, ReviewStars } from "@/features/reviews/components/review-card"
import { ReviewForm } from "@/features/reviews/components/review-form"
import { publicReviews, reviewProducts } from "@/server/reviews"

export const metadata: Metadata = { title: "Customer reviews", description: "Real customer reviews and photos from Sole Drop shoppers.", alternates: { canonical: "/reviews" } }

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const requested = Number((await searchParams).page ?? "1")
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, 1000) : 1
  const [reviews, products] = await Promise.all([publicReviews(page), reviewProducts()])
  const { items, summary, pages } = reviews
  return <div className="bg-surface pb-20">
    <section className="bg-foreground py-14 text-background md:py-20"><Container>
      <p className="text-14 font-extrabold tracking-widest text-brand uppercase">The community</p>
      <h1 className="mt-3 max-w-4xl text-54 leading-none font-black uppercase md:text-100">Customer reviews<span className="text-brand">.</span></h1>
      <p className="mt-5 max-w-2xl text-18 text-white/75">Honest feedback from people who shop with Sole Drop. Photos are shared by customers and reviews appear after moderation.</p>
      <a href="#write-review" className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-brand px-6 font-extrabold text-brand-foreground">Write a review →</a>
    </Container></section>
    <Container>
      <section aria-label="Review ratings" className="-mt-7 relative grid gap-6 rounded-2xl bg-background p-6 shadow-card-lift md:grid-cols-2 md:p-9">
        <div className="flex flex-col justify-center"><p className="text-14 font-bold tracking-wider text-faint-foreground uppercase">What shoppers say</p>
          {summary.total ? <><div className="mt-2 flex items-baseline gap-3"><strong className="text-68 font-black leading-none">{summary.average.toFixed(1)}</strong><span className="text-18 font-bold">out of 5</span></div><div className="mt-3"><ReviewStars rating={summary.average} size="large" /></div><p className="mt-2 text-16 text-faint-foreground">Based on {summary.total} approved {summary.total === 1 ? "review" : "reviews"}</p></>
            : <p className="mt-3 text-20 font-bold">No published reviews yet. Be the first to share your experience.</p>}
        </div>
        <div className="grid gap-2">{[5, 4, 3, 2, 1].map((rating) => <div key={rating} className="flex items-center gap-3 text-14 font-bold"><span className="w-9">{rating} ★</span><div className="h-3 flex-1 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-brand" style={{ width: `${summary.total ? summary.counts[rating as 1 | 2 | 3 | 4 | 5] / summary.total * 100 : 0}%` }} /></div><span className="w-8 text-end text-faint-foreground">{summary.counts[rating as 1 | 2 | 3 | 4 | 5]}</span></div>)}</div>
      </section>
      <section aria-labelledby="all-reviews-title" className="pt-16"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-14 font-extrabold tracking-widest text-faint-foreground uppercase">Shared by shoppers</p><h2 id="all-reviews-title" className="mt-2 text-34 font-black uppercase md:text-54">All reviews</h2></div><a href="#write-review" className="rounded-xl border-2 border-foreground px-5 py-3 font-extrabold hover:bg-foreground hover:text-background">Share your experience</a></div>
        {items.length ? <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{items.map((review) => <ReviewCard key={review.id} review={review} />)}</div> : <p className="mt-7 rounded-xl bg-background p-8 text-17">There are no reviews on this page yet.</p>}
        {pages > 1 ? <nav aria-label="Review pages" className="mt-9 flex flex-wrap items-center justify-center gap-3">{page > 1 ? <Link className="rounded-lg border border-border px-4 py-2 font-bold" href={`/reviews?page=${page - 1}`}>← Previous</Link> : null}<span className="px-3 text-16">Page {page} of {pages}</span>{page < pages ? <Link className="rounded-lg border border-border px-4 py-2 font-bold" href={`/reviews?page=${page + 1}`}>Next →</Link> : null}</nav> : null}
      </section>
      <section id="write-review" aria-labelledby="write-review-title" className="mt-20 scroll-mt-24 rounded-2xl bg-background p-6 shadow-card-lift md:p-10"><div className="mb-8"><p className="text-14 font-extrabold tracking-widest text-faint-foreground uppercase">Your turn</p><h2 id="write-review-title" className="mt-2 text-34 font-black uppercase md:text-54">Write a review</h2><p className="mt-3 text-16 text-faint-foreground">Tell us about a pair or your Sole Drop shopping experience. Photos are welcome.</p></div><ReviewForm products={products} /></section>
    </Container>
  </div>
}
