import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

import {
  ArrowExploreIcon,
  ArrowRightIcon,
  InstagramIcon,
} from "@/components/icons"
import { Container } from "@/components/shared/container"
import { SectionTitle } from "@/components/shared/section-title"
import { buttonVariants } from "@/components/ui/button"
import { ProductRow } from "@/features/catalog/components/product-row"
import { BrandMarquee } from "@/features/home/components/brand-marquee"
import { NewArrivalSwitch } from "@/features/home/components/new-arrival-switch"
import type { CardProduct } from "@/features/catalog/types/card"
import type { HomeContent } from "@/server/content/home-types"
import { cn } from "@/lib/utils"

export function Hero({ children, content }: { children: ReactNode; content: HomeContent }) {
  return (
    <section
      aria-labelledby="hero-title"
      className="grid min-w-0 bg-foreground text-background lg:grid-cols-2 3xl:grid-cols-hero"
    >
      <div className="flex min-w-0 flex-col items-start px-5 pt-10 pb-12 md:px-10 lg:pt-12 xl:px-16 3xl:ps-30 3xl:pe-0 3xl:pt-17.75 3xl:pb-17.75">
        <h1
          id="hero-title"
          className="flex max-w-full flex-col text-60 leading-hero font-black wrap-anywhere uppercase md:text-100 xl:text-120 3xl:text-150"
        >
          {content.heading.some(Boolean) ? content.heading.map((line, index) => <span key={index} className={index % 2 ? "text-brand" : undefined}>{line}</span>) : <span>Sole Drop</span>}
        </h1>
        <p className="max-w-156 pt-4 text-18 font-medium wrap-anywhere text-muted-foreground md:text-24 3xl:pt-5.25 3xl:text-28">
          {content.description}
        </p>
        <div className="flex max-w-full flex-wrap gap-4 pt-8 md:gap-11 3xl:pt-13.5">
          {content.buttons.map((button, index) => <Link key={index}
            href={button.href}
            className={cn(
              buttonVariants({ tone: index ? "paper" : "brand-on-ink", size: "hero" }),
              index ? "tracking-wide-2" : "",
              "h-auto min-h-14 max-w-full py-3 whitespace-normal wrap-anywhere md:h-auto md:min-h-16 3xl:h-auto 3xl:min-h-21"
            )}
          >
            {button.label}
          </Link>)}
        </div>
      </div>
      <div className="aspect-4/3 lg:aspect-auto">{children}</div>
    </section>
  )
}

export function ShopByCategory({ categories }: { categories: HomeContent["categories"] }) {
  return (
    <section
      aria-labelledby="categories-title"
      className="py-14 md:py-20 3xl:py-30"
    >
      <Container className="flex flex-col gap-8 md:gap-10 3xl:gap-13.5">
        <SectionTitle id="categories-title">Shop by category</SectionTitle>
        <ul className="grid gap-8 pe-3.5 lg:grid-cols-2 3xl:gap-20 3xl:pe-0">
          {categories.map((category, index) => (
            <li key={`${category.href}-${index}`}>
              <Link
                href={category.href}
                className="group relative flex min-h-80 flex-col items-start gap-6 overflow-hidden rounded-card border-2 border-subtle-foreground p-6 shadow-offset-brand md:min-h-128 md:gap-10 md:ps-14.5 md:pt-23"
              >
                <Image
                  src={category.image.src}
                  alt={category.image.alt}
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="-z-10 object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <h3 className="flex max-w-full flex-col text-56 leading-none font-extrabold tracking-tight-2 wrap-anywhere text-foreground uppercase md:text-100">
                  <span>{category.title[0]}</span>
                  <span>{category.title[1]}</span>
                </h3>
                <span
                  className={cn(
                    buttonVariants({ tone: "ink", size: "hero" }),
                    "gap-3.5 rounded-2xl group-hover:bg-brand group-hover:text-brand-foreground"
                  )}
                >
                  Explore
                  {/* The generated icon is drawn in brand lime; here it follows the button's text so it shows on lime too (D-072). */}
                  <ArrowExploreIcon className="h-5.75 w-auto transition-transform duration-200 group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1 [&_path]:stroke-current [&_use]:fill-current" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  )
}

/** A home product row; `viewAll` adds a link to the full listing beside the heading (D-074). */
export function ProductSection({
  id,
  title,
  products,
  display = false,
  viewAll,
}: {
  id: string
  title: string
  products: CardProduct[]
  display?: boolean
  viewAll?: { href: string; label: string }
}) {
  return (
    <section
      aria-labelledby={id}
      className="bg-surface py-14 md:py-20 3xl:py-30"
    >
      <Container className="flex flex-col gap-8 md:gap-10 3xl:gap-14">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <SectionTitle id={id} display={display}>
            {title}
          </SectionTitle>
          {viewAll ? (
            <Link
              href={viewAll.href}
              className="group flex min-h-11 items-center gap-2.5 text-16 font-bold uppercase underline-offset-4 hover:underline md:text-20"
            >
              View all<span className="sr-only"> {viewAll.label}</span>
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-full bg-foreground text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground md:size-11"
              >
                <ArrowRightIcon className="h-auto w-3.5 transition-transform group-hover:translate-x-0.5 md:w-4 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
              </span>
            </Link>
          ) : null}
        </div>
        <ProductRow products={products} />
      </Container>
    </section>
  )
}

/** The New Arrival row with its Brand New / Pre-Loved switch and "View all" (D-075). */
export function NewArrivalSection({
  brandNew,
  preloved,
}: {
  brandNew: CardProduct[]
  preloved: CardProduct[]
}) {
  return (
    <section
      aria-labelledby="new-arrival-title"
      className="bg-surface py-14 md:py-20 3xl:py-30"
    >
      <Container>
        <NewArrivalSwitch
          titleId="new-arrival-title"
          brandNew={<ProductRow products={brandNew} />}
          preloved={<ProductRow products={preloved} />}
        />
      </Container>
    </section>
  )
}

export function TopBrands({ brands }: { brands: string[] }) {
  return (
    <section aria-labelledby="brands-title" className="py-12 md:py-17.5">
      <Container>
        <BrandMarquee title="TOP BRANDS" brands={brands} />
      </Container>
    </section>
  )
}

const reasons = [
  ["New & pre-loved", "Something for every budget and style."],
  [
    "Authentic products",
    "Every product verified against our authenticity policy.",
  ],
  [
    "Condition transparency",
    "Clear photos and honest condition grading for pre-loved pairs.",
  ],
  ["Multiple sizes", "Wide size range — find your fit without the hassle."],
  ["Easy returns", "Straightforward return and exchange policy."],
] as const

function Sparkle() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="mt-1.5 size-4 shrink-0 fill-brand"
    >
      <path d="M8 0c.5 4.2 3.3 7 7.5 8-4.2 1-7 3.8-7.5 8-.5-4.2-3.3-7-7.5-8C4.7 7 7.5 4.2 8 0Z" />
    </svg>
  )
}

export function WhySoleDrop() {
  return (
    <section aria-labelledby="why-title" className="py-14 md:py-17">
      <Container className="grid gap-12 lg:grid-cols-2 lg:items-center 3xl:grid-cols-why 3xl:gap-0">
        <div className="flex flex-col gap-4 3xl:ps-1">
          <p className="text-14 font-extrabold tracking-wide-2 text-faint-foreground uppercase">
            The Sole Drop difference
          </p>
          <h2
            id="why-title"
            className="flex flex-col text-56 leading-none font-black tracking-tight-3 uppercase md:text-68"
          >
            <span>Why</span>
            <span>Sole</span>
            <span className="w-fit bg-brand text-brand-foreground shadow-highlight-bleed">
              Drop?
            </span>
          </h2>
          <p className="max-w-130 pt-10 text-18 leading-relaxed text-subtle-foreground md:text-22">
            We built SOLE DROP for people who believe the right pair can change
            the way you move, feel and express yourself.
          </p>
        </div>
        <ul className="flex flex-col">
          {reasons.map(([title, text]) => (
            <li
              key={title}
              className="flex gap-6 border-b border-surface-sunken py-7.5 last:border-b-0 3xl:first:pt-11.5 3xl:last:pb-6.5"
            >
              <Sparkle />
              <div className="flex flex-col gap-2">
                <h3 className="text-18 font-bold tracking-wide-2 uppercase md:text-20">
                  {title}
                </h3>
                <p className="text-16 text-faint-foreground md:text-18">
                  {text}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  )
}

export function InstagramStrip({ instagram }: { instagram: HomeContent["instagram"] }) {
  return (
    <section
      aria-labelledby="instagram-title"
      className="bg-surface py-14 md:py-20"
    >
      <Container className="flex flex-col items-center gap-10 md:gap-12.25">
        <div className="flex w-full min-w-0 flex-col items-center gap-2.25 text-center">
          <h2
            id="instagram-title"
            className="text-28 font-black uppercase md:text-40"
          >
            Follow SOLEDROP
          </h2>
          <p className="max-w-full text-18 font-bold wrap-anywhere text-faint-foreground md:text-20">
            {instagram.handle}
          </p>
        </div>
        <ul className="grid w-full max-w-376 grid-cols-2 gap-4 md:grid-cols-4 md:gap-12 md:pb-0.25">
          {instagram.images.map(({ src, alt }, index) => (
            <li key={`${src}-${index}`}>
              {/* Each post opens the Instagram profile; hover or focus dims the photo and shows the Instagram mark (D-051). */}
              <a
                href={instagram.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block aspect-340/440 overflow-hidden rounded-3xl bg-foreground"
              >
                <Image
                  src={src}
                  alt={alt}
                  fill
                  sizes="(min-width: 1920px) 340px, (min-width: 768px) 22vw, 45vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-foreground/50 text-background opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                  <InstagramIcon className="size-10 md:size-12" />
                </span>
                <span className="sr-only">
                  Instagram post {index + 1} by{" "}
                  {instagram.handle} (opens in a new tab)
                </span>
              </a>
            </li>
          ))}
        </ul>
        <a
          href={instagram.href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ tone: "ink-light", size: "lg" }),
            "w-full max-w-110 rounded-none font-bold"
          )}
        >
          Follow us on Instagram
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </Container>
    </section>
  )
}
