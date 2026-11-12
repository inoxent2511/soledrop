import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Container } from "@/components/shared/container"
import { CollectionBanner } from "@/features/catalog/components/collection-banner"
import { ListingBody } from "@/features/catalog/components/listing-body"
import { ListingToolbar } from "@/features/catalog/components/listing-toolbar"
import { hasFilters, toListingState, type RawParams } from "@/features/catalog/lib/listing-url"
import { parseProductQuery } from "@/features/catalog/schemas/query"
import { getCollection, listingData } from "@/server/storefront"

const SLUG = "pre-loved"
const PATHNAME = "/pre-loved"

type Props = { searchParams: Promise<RawParams> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const collection = await getCollection(SLUG)
  if (!collection) return {}
  return {
    title: collection.seo.title ?? collection.title,
    description: collection.seo.description ?? collection.description,
    alternates: { canonical: PATHNAME },
    robots: hasFilters(toListingState(await searchParams)) ? { index: false, follow: true } : undefined,
  }
}

/** Pre-Loved (screen 03): banner, toolbar and grid on the collection page's rhythm (the grades live on /condition-guide, D-047). */
export default async function PreLovedPage({ searchParams }: Props) {
  const raw = await searchParams
  const state = toListingState(raw)
  const data = await listingData({ ...parseProductQuery(raw), collection: SLUG })
  if (!data) notFound()

  const { collection, results, filters } = data
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
          <ListingToolbar pathname={PATHNAME} state={state} view={view} />
        </div>
        <div className="3xl:pt-12">
          <ListingBody pathname={PATHNAME} state={state} view={view} results={results} filters={filters} />
        </div>
      </Container>
    </div>
  )
}
