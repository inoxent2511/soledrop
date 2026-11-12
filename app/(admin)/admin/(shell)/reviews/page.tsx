import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/admin/page-header"
import { AdminReviewList } from "@/features/reviews/components/admin-review-list"
import { can, permissionPage } from "@/server/admin/dal"
import { staffReviews, type ReviewStatus } from "@/server/reviews"

export const metadata: Metadata = { title: "Customer reviews" }

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const staff = await permissionPage("reviews:read", "/admin/reviews")
  const requested = (await searchParams).status
  const status: ReviewStatus | "all" = requested === "approved" || requested === "rejected" || requested === "all" ? requested : "pending"
  const reviews = await staffReviews(staff.member.storeId, status)
  return <>
    <PageHeader title="Customer reviews" description="Read customer feedback and photos. Approve reviews before they appear on the store, hide unsuitable ones, and choose which approved reviews appear first on the homepage." />
    <nav aria-label="Review status" className="flex flex-wrap gap-2">{(["pending", "approved", "rejected", "all"] as const).map((option) => <Link key={option} href={`/admin/reviews?status=${option}`} className={`rounded-lg px-4 py-2 text-16 font-bold capitalize ${status === option ? "bg-foreground text-background" : "border border-border bg-background"}`}>{option}</Link>)}</nav>
    <AdminReviewList reviews={reviews} canWrite={can(staff, "reviews:write")} />
    {reviews.length === 200 ? <p className="text-14 text-faint-foreground">Showing the 200 newest reviews in this view.</p> : null}
  </>
}
