import { toCardProduct } from "@/features/catalog/types/card"
import { FeaturedBuyBox } from "@/features/home/components/featured-buy-box"
import { FeaturedDrops } from "@/features/home/components/featured-drops"
import { HeroCarousel } from "@/features/home/components/hero-carousel"
import {
  Hero,
  InstagramStrip,
  NewArrivalSection,
  ProductSection,
  ShopByCategory,
  TopBrands,
  WhySoleDrop,
} from "@/features/home/components/home-sections"
import { homeData, stockByVariant } from "@/server/storefront"
import { catalog } from "@/server/catalog"
import { contentRepository } from "@/server/content"
import { emptyHome } from "@/server/content/home-types"
import { currentStoreId } from "@/server/db/driver"
import { publicReviews } from "@/server/reviews"
import { ReviewHomeSection } from "@/features/reviews/components/review-card"

export const revalidate = 300

export default async function HomePage() {
  const storeId = currentStoreId()
  const [record, brands, reviews] = await Promise.all([contentRepository().home(storeId), catalog().brands(storeId), publicReviews(1, 3)])
  const home = record?.content ?? emptyHome
  const { newArrivals, newestPreloved, brandNew, preloved, featured } =
    await homeData()

  return (
    <>
      {home.slides.length ? <Hero content={home}>
        <HeroCarousel slides={home.slides} initial={Math.min(1, home.slides.length - 1)} />
      </Hero> : <h1 className="sr-only">Sole Drop</h1>}
      {home.categories.length ? <ShopByCategory categories={home.categories} /> : null}
      <NewArrivalSection
        brandNew={newArrivals.map(toCardProduct)}
        preloved={newestPreloved.map(toCardProduct)}
      />
      {featured.length ? (
        <FeaturedDrops
          slides={featured.map((product) => ({
            kind: product.kind,
            image: product.images[0] ?? null,
            content: (
              <FeaturedBuyBox
                product={toCardProduct(product)}
                stock={stockByVariant(product)}
              />
            ),
          }))}
        />
      ) : null}
      <ProductSection
        id="brand-new-title"
        title="Brand New Drops"
        products={brandNew.map(toCardProduct)}
        display
        viewAll={{ href: "/collections/brand-new", label: "brand-new pairs" }}
      />
      <ProductSection
        id="preloved-title"
        title="Pre-Loved Drops"
        products={preloved.map(toCardProduct)}
        display
        viewAll={{ href: "/pre-loved", label: "pre-loved pairs" }}
      />
      <ReviewHomeSection reviews={reviews.items} total={reviews.summary.total} average={reviews.summary.average} />
      {brands.length ? <TopBrands brands={brands.map((brand) => brand.name.toUpperCase())} /> : null}
      <WhySoleDrop />
      {home.instagram.images.length ? <InstagramStrip instagram={home.instagram} /> : null}
    </>
  )
}
