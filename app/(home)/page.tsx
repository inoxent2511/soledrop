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

export const revalidate = 300

const heroSlides = [
  {
    src: "/images/site/hero-1.jpg",
    alt: "Volt green Nike trainer on a lime background",
  },
  {
    src: "/images/site/hero-2.jpg",
    alt: "Runner wearing neon Reebok running shoes on a concrete floor",
  },
  {
    src: "/images/site/collection-banner.jpg",
    alt: "Neon adidas running shoe lit in green and violet",
  },
]

export default async function HomePage() {
  const { newArrivals, newestPreloved, brandNew, preloved, featured } =
    await homeData()

  return (
    <>
      <Hero>
        <HeroCarousel slides={heroSlides} initial={1} />
      </Hero>
      <ShopByCategory />
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
      <TopBrands />
      <WhySoleDrop />
      <InstagramStrip />
    </>
  )
}
