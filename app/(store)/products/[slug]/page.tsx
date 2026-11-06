import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Container } from "@/components/shared/container"
import { JsonLd } from "@/components/shared/json-ld"
import { SectionTitle } from "@/components/shared/section-title"
import { ProductBuyBox } from "@/features/catalog/components/product-buy-box"
import { ProductGallery } from "@/features/catalog/components/product-gallery"
import { ProductInformation, type InformationItem } from "@/features/catalog/components/product-information"
import { ProductRow } from "@/features/catalog/components/product-row"
import { TrustRow } from "@/features/catalog/components/trust-row"
import { CONDITION_GUIDE } from "@/features/catalog/lib/condition-grades"
import { toCardProduct } from "@/features/catalog/types/card"
import { PolicyExcerpt } from "@/features/content/components/policy-document"
import { returnsDocument, returnsExcerptSections } from "@/content/returns"
import { shippingDocument, shippingExcerptSections } from "@/content/shipping"
import { RecordView } from "@/features/search/components/record-view"
import { conditionLabel, formatPrice } from "@/lib/format"
import { siteConfig } from "@/lib/site"
import { cn } from "@/lib/utils"
import { galleryImages } from "@/server/catalog/types"
import { getProduct, productPageData, toSuggestProduct } from "@/server/storefront"

type Props = { params: Promise<{ slug: string }> }

/**
 * Rendered on first visit and cached for a minute (docs/app/caching.md). Size availability can be
 * a minute old; adding to the bag re-checks stock on the server, so a stale page never oversells.
 */
export const revalidate = 60

export function generateStaticParams(): { slug: string }[] {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product || product.status !== "active") return {}
  const image = galleryImages(product.images)[0]
  return {
    title: product.seo.title ?? product.title,
    description: product.seo.description ?? product.description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { type: "website", title: product.title, description: product.description, images: image ? [{ url: image.url, alt: image.alt }] : undefined },
  }
}

/** Product page — new pairs (screen 04, Frame 195) and one-of-a-kind pre-loved pairs (screen 05, Frame 194). */
export default async function ProductPage({ params }: Props) {
  const { slug } = await params
  const data = await productPageData(slug)
  if (!data) notFound()

  const { product, related, details, freeDeliveryOver, standardShipping } = data
  const preloved = product.kind === "preloved"
  const { amount, compareAt, currency, discountPercent } = product.price
  const sizes = product.variants.map((variant, index) => ({
    variantId: variant.id,
    eu: variant.size.eu,
    uk: variant.size.uk,
    us: variant.size.us,
    stock: product.stock[index]?.available ?? 0,
  }))
  const grade = product.condition ? CONDITION_GUIDE.find((entry) => entry.grade === product.condition) : undefined

  const information: InformationItem[] = [
    {
      title: "Description",
      content: (
        <div className="flex flex-col gap-4">
          <p className="text-16 text-subtle-foreground md:text-18">{product.description}</p>
          {details.length ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-16 md:text-18">
              {details.map((detail) => (
                <div key={detail.label} className="contents">
                  <dt className="font-semibold">{detail.label}</dt>
                  <dd className="text-subtle-foreground">{detail.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ),
    },
    ...(preloved && product.condition
      ? [
          {
            title: "Condition",
            content: (
              <div className="flex flex-col gap-3 text-16 md:text-18">
                <p>
                  <span className="font-semibold">{conditionLabel(product.condition)}</span>
                  <span className="text-subtle-foreground"> — {grade?.text}</span>
                </p>
                {product.conditionNotes ? <p className="text-subtle-foreground">{product.conditionNotes}</p> : null}
                <Link href="/condition-guide" className="w-fit font-bold underline underline-offset-4 hover:text-subtle-foreground">
                  How we grade pre-loved pairs
                </Link>
              </div>
            ),
          },
        ]
      : []),
    // The Delivery panel shows the Shipping & Delivery Policy's charges and timing, with a link to the full page (D-056).
    { title: "Delivery", content: <PolicyExcerpt document={shippingDocument} sectionIds={shippingExcerptSections} href="/shipping" values={standardShipping ? { standardShipping } : {}} /> },
    // The Returns panel shows how to start a return and this kind of pair's requirements (D-057).
    { title: "Returns", content: <PolicyExcerpt document={returnsDocument} sectionIds={returnsExcerptSections(product.kind)} href="/returns" /> },
  ]

  const { slug: viewedSlug, title, brand, image, price } = toSuggestProduct(product)
  const viewed = { slug: viewedSlug, title, brand, image, price }
  const url = `${siteConfig.url}/products/${product.slug}`
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    sku: product.variants[0]?.sku,
    brand: { "@type": "Brand", name: product.brand.name },
    image: product.images.map((image) => `${siteConfig.url}${image.url}`),
    url,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: currency,
      price: (amount / 100).toFixed(2),
      availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: preloved ? "https://schema.org/UsedCondition" : "https://schema.org/NewCondition",
    },
  }

  return (
    <>
      <JsonLd data={jsonLd} />
      <RecordView product={viewed} />
      <Container className="grid items-start gap-8 pt-6 pb-12 md:pt-12 lg:grid-cols-2 lg:gap-12 3xl:grid-cols-pdp 3xl:gap-14.75 3xl:pt-25 3xl:pb-19.75">
        <ProductGallery images={galleryImages(product.images).map((image) => ({ url: image.url, alt: image.alt }))} title={product.title} />

        <div className="flex flex-col 3xl:pt-5">
          <div className="flex flex-col border-b border-border pb-4.75 3xl:w-200">
            <h1 className="text-32 font-bold md:text-44 3xl:ps-0.25 3xl:text-54">{product.title}</h1>
            <div className="flex flex-col gap-3.5 pt-5 3xl:ps-0.25 3xl:pt-10">
              <p className="flex flex-wrap items-start gap-x-7.5 gap-y-2">
                <span className="sr-only">{compareAt ? "Sale price" : "Price"}</span>
                <span className="text-34 font-bold tracking-tight-2 md:text-44 3xl:text-50">{formatPrice(amount, currency, { symbol: true })}</span>
                {compareAt ? (
                  <>
                    <span className="sr-only">, was</span>
                    <s className="pt-1.5 text-20 tracking-tight-3 text-faint-foreground md:pt-2.5 md:text-24 3xl:pt-3.5 3xl:text-28">{formatPrice(compareAt, currency)}</s>
                  </>
                ) : null}
                {discountPercent ? (
                  <span className="flex 3xl:pt-0.5">
                    <span className="flex h-11 items-start rounded-sm bg-brand ps-3.5 pe-3.5 pt-2.25 text-20 font-bold tracking-tight-1 text-brand-foreground md:h-14.5 md:ps-4.75 md:pe-4.5 md:pt-3.5 md:text-26">
                      {discountPercent}% OFF
                    </span>
                  </span>
                ) : null}
              </p>
              {compareAt && compareAt > amount ? (
                <p className="text-20 font-medium tracking-tight-1 text-success md:text-28">You save {formatPrice(compareAt - amount, currency, { symbol: true })}</p>
              ) : null}
            </div>
          </div>

          <div className="3xl:w-200">
            <ProductBuyBox title={product.title} kind={product.kind} sizes={sizes} condition={product.condition} />
          </div>

          <div className="pt-8 3xl:w-200.25 3xl:ps-0.25 3xl:pt-11">
            <TrustRow freeDeliveryOver={freeDeliveryOver} />
          </div>
        </div>
      </Container>

      <div className="bg-surface">
        <Container className="py-10 md:py-16 3xl:px-55 3xl:py-19.5">
          <ProductInformation items={information} className={preloved ? "3xl:pb-17.5" : "3xl:pb-18.25"} />
        </Container>
      </div>

      {related.length ? (
        <section aria-labelledby="related-title" className={cn("py-14 md:py-20", preloved ? "3xl:pt-22.25 3xl:pb-37.25" : "3xl:py-30")}>
          <Container className={cn("flex flex-col gap-8 md:gap-10", preloved ? "3xl:gap-14.5" : "3xl:gap-14")}>
            <SectionTitle id="related-title">You may also like</SectionTitle>
            <ProductRow products={related.map(toCardProduct)} />
          </Container>
        </section>
      ) : null}
    </>
  )
}
