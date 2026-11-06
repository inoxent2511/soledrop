import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"

import { Container } from "@/components/shared/container"
import { PageBand } from "@/components/shared/page-band"
import { Blocks } from "@/features/content/components/block-registry"
import { formatDate } from "@/lib/format"
import { getContentPage } from "@/server/storefront"

type Props = { params: Promise<{ slug: string }> }

/** Old content-page slugs → the designed pages that replaced them. */
const MOVED_PAGES: Record<string, string> = { terms: "/terms", "privacy-policy": "/privacy", shipping: "/shipping", returns: "/returns" }

/** Rendered on first visit and cached for five minutes (docs/app/caching.md). */
export const revalidate = 300

export function generateStaticParams(): { slug: string }[] {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getContentPage((await params).slug)
  if (!page) return {}
  return {
    title: page.seo.title ?? page.title,
    description: page.seo.description ?? page.description,
    alternates: { canonical: `/pages/${page.slug}` },
    robots: page.seo.noindex ? { index: false, follow: true } : undefined,
  }
}

/**
 * Content pages (derived: About, Our Story). The inside-page
 * band, then the page's blocks rendered by the block registry in a readable column.
 */
export default async function ContentPage({ params }: Props) {
  const { slug } = await params
  // The owner's legal pages left the block system for designed pages of their own (D-054 to D-057).
  const moved = MOVED_PAGES[slug]
  if (moved) permanentRedirect(moved)
  const page = await getContentPage(slug)
  if (!page) notFound()

  return (
    <>
      <PageBand display description={page.description}>
        {page.title}
      </PageBand>
      <Container className="flex justify-center pt-10 pb-20 md:pt-16 md:pb-28">
        <article className="flex w-full max-w-200 flex-col gap-8">
          <Blocks blocks={page.blocks} />
          <p className="border-t border-border pt-6 text-16 text-subtle-foreground">Last updated {formatDate(page.updatedAt)}</p>
        </article>
      </Container>
    </>
  )
}
