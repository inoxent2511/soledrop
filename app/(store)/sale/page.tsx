import type { Metadata } from "next"

import { Container } from "@/components/shared/container"
import { CollectionBanner } from "@/features/catalog/components/collection-banner"
import { KIND_TABS_STEP, KindTabs, type KindTab, type KindTabsPage } from "@/features/catalog/components/kind-tabs"
import { ProductCard } from "@/features/catalog/components/product-card"
import { toCardProduct } from "@/features/catalog/types/card"
import type { ProductPage } from "@/server/catalog/types"
import { saleData } from "@/server/storefront"

const PATHNAME = "/sale"

type Props = { searchParams: Promise<{ tab?: string | string[]; show?: string | string[] }> }

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

const TABS_PAGE: KindTabsPage = {
  pathname: PATHNAME,
  idPrefix: "sale",
  label: "Sale",
  emptyTitle: "No markdowns right now",
}

const emptyText = (noun: string) => `Discounted ${noun} pairs show up here the moment they're marked down. Until then, browse everything in stock.`

export const metadata: Metadata = {
  title: "Sale",
  description: "Marked-down brand-new and pre-loved pairs at Soledrop, while sizes last.",
  alternates: { canonical: PATHNAME },
}

/**
 * Sale (D-053): its own page, like New Arrivals, rather than a nav dropdown. Every pair priced below
 * its compare-at price, new or pre-loved, under Brand New and Pre-Loved tabs; no filters.
 */
export default async function SalePage({ searchParams }: Props) {
  const params = await searchParams
  const initialTab = first(params.tab) === "preloved" ? "preloved" : "new"
  const requested = Number(first(params.show))
  const initialShown = Number.isInteger(requested) && requested > KIND_TABS_STEP ? requested : KIND_TABS_STEP

  const { collection, brandNew, preloved } = await saleData()
  const cards = (page: ProductPage) =>
    page.items.map((product, index) => <ProductCard key={product.id} product={toCardProduct(product)} priority={index < 4} headingLevel="h2" />)

  const tabs: KindTab[] = [
    { id: "new", label: "Brand New", noun: "brand-new", total: brandNew.total, cards: cards(brandNew), seeAllHref: "/collections/brand-new", emptyText: emptyText("brand-new") },
    { id: "preloved", label: "Pre-Loved", noun: "pre-loved", total: preloved.total, cards: cards(preloved), seeAllHref: "/pre-loved", emptyText: emptyText("pre-loved") },
  ]
  const total = brandNew.total + preloved.total
  const bestDiscount = Math.max(0, ...[...brandNew.items, ...preloved.items].map((product) => product.price.discountPercent ?? 0))
  const eyebrow = [bestDiscount > 0 ? `Up to ${bestDiscount}% off` : null, total > 0 ? `${total} ${total === 1 ? "pair" : "pairs"} on sale` : null].filter(Boolean).join(" · ")

  return (
    <div className="bg-surface">
      <Container className="flex flex-col gap-8 pt-6 pb-16 md:gap-12 md:pt-12 3xl:gap-20 3xl:pt-20 3xl:pb-23.25">
        <CollectionBanner
          title="Sale"
          eyebrow={eyebrow || "Sale"}
          headline={["On", "Sale"]}
          description={collection?.description ?? "Marked-down pairs while sizes last."}
          image={collection?.image ? { url: collection.image.url, alt: collection.image.alt } : null}
        />
        <KindTabs page={TABS_PAGE} tabs={tabs} initialTab={initialTab} initialShown={initialShown} />
      </Container>
    </div>
  )
}
