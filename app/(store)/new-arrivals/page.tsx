import type { Metadata } from "next"

import { Container } from "@/components/shared/container"
import { CollectionBanner } from "@/features/catalog/components/collection-banner"
import { KIND_TABS_STEP, KindTabs, type KindTab, type KindTabsPage } from "@/features/catalog/components/kind-tabs"
import { ProductCard } from "@/features/catalog/components/product-card"
import { toCardProduct } from "@/features/catalog/types/card"
import type { ProductPage } from "@/server/catalog/types"
import { newArrivalsData } from "@/server/storefront"

const PATHNAME = "/new-arrivals"
const DESCRIPTION = "Fresh releases and verified pre-loved pairs, every week."

type Props = { searchParams: Promise<{ tab?: string | string[]; show?: string | string[] }> }

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

const TABS_PAGE: KindTabsPage = {
  pathname: PATHNAME,
  idPrefix: "arrivals",
  label: "New arrivals",
  emptyTitle: "Nothing new just yet",
}

const emptyText = (noun: string) => `New ${noun} pairs land every week. Check back soon, or browse everything in stock.`

export const metadata: Metadata = {
  title: "New Arrivals",
  description: "The newest brand-new releases and verified pre-loved pairs at Soledrop, every week.",
  alternates: { canonical: PATHNAME },
}

/**
 * New Arrivals (D-052): its own page rather than a nav dropdown. The banner, then Brand New and
 * Pre-Loved tabs that swap the newest pairs in place; no filters and no "all" tab, by design.
 */
export default async function NewArrivalsPage({ searchParams }: Props) {
  const params = await searchParams
  const initialTab = first(params.tab) === "preloved" ? "preloved" : "new"
  const requested = Number(first(params.show))
  const initialShown = Number.isInteger(requested) && requested > KIND_TABS_STEP ? requested : KIND_TABS_STEP

  const { collection, brandNew, preloved } = await newArrivalsData()
  const cards = (page: ProductPage) =>
    page.items.map((product, index) => <ProductCard key={product.id} product={toCardProduct(product)} priority={index < 4} headingLevel="h2" />)

  const tabs: KindTab[] = [
    { id: "new", label: "Brand New", noun: "brand-new", total: brandNew.total, cards: cards(brandNew), seeAllHref: "/collections/new-arrivals?kind=new", emptyText: emptyText("brand-new") },
    { id: "preloved", label: "Pre-Loved", noun: "pre-loved", total: preloved.total, cards: cards(preloved), seeAllHref: "/pre-loved?sort=newest", emptyText: emptyText("pre-loved") },
  ]

  return (
    <div className="bg-surface">
      <Container className="flex flex-col gap-8 pt-6 pb-16 md:gap-12 md:pt-12 3xl:gap-20 3xl:pt-20 3xl:pb-23.25">
        <CollectionBanner
          title="New Arrivals"
          headline={["New", "Arrivals"]}
          description={DESCRIPTION}
          image={collection?.image ?? null}
        />
        <KindTabs page={TABS_PAGE} tabs={tabs} initialTab={initialTab} initialShown={initialShown} />
      </Container>
    </div>
  )
}
