import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"

import { Container } from "@/components/shared/container"
import { CollectionBanner } from "@/features/catalog/components/collection-banner"
import { ListingBody } from "@/features/catalog/components/listing-body"
import { ListingToolbar } from "@/features/catalog/components/listing-toolbar"
import { hasFilters, toListingState, type RawParams } from "@/features/catalog/lib/listing-url"
import { parseProductQuery } from "@/features/catalog/schemas/query"
import { getCollection, listingData } from "@/server/storefront"

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawParams> }

/** Collections with a page of their own; Sale keeps the shopper's Brand New / Pre-Loved choice (D-053). */
const DEDICATED_PAGES: Record<string, (params: RawParams) => string> = {
  "pre-loved": () => "/pre-loved",
  sale: (params) => ([params.kind].flat()[0] === "preloved" ? "/sale?tab=preloved" : "/sale"),
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const collection = await getCollection(slug)
  if (!collection) return {}
  const filtered = hasFilters(toListingState(await searchParams))
  return {
    title: collection.seo.title ?? collection.title,
    description: collection.seo.description ?? collection.description,
    alternates: { canonical: `/collections/${collection.slug}` },
    robots: filtered ? { index: false, follow: true } : undefined,
  }
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { slug } = await params
  const raw = await searchParams
  const dedicated = DEDICATED_PAGES[slug]
  if (dedicated) permanentRedirect(dedicated(raw))
  const state = toListingState(raw)
  const data = await listingData({ ...parseProductQuery(raw), collection: slug })
  if (!data) notFound()

  const { collection, results, filters } = data
  const pathname = `/collections/${collection.slug}`
  const view = state.view?.[0] === "list" ? "list" : "grid"

  return (
    <div className="bg-surface">
      <Container className="flex flex-col gap-8 pt-6 pb-16 md:gap-12 md:pt-12 3xl:gap-0 3xl:pt-20 3xl:pb-23.25">
        <CollectionBanner
          title={collection.title}
          headline={collection.headline}
          description={collection.description}
          image={collection.image}
        />
        <div className="3xl:pt-20">
          <ListingToolbar pathname={pathname} state={state} view={view} />
        </div>
        <div className="3xl:pt-12">
          <ListingBody pathname={pathname} state={state} view={view} results={results} filters={filters} />
        </div>
      </Container>
    </div>
  )
}
