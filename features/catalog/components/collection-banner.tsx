import Image from "next/image"

type CollectionBannerProps = {
  title: string
  headline: [string, string]
  description: string
  image: { url: string; alt: string } | null
}

/**
 * The black "EVERY STEP / MATTERS" banner (Frame 126, 1680×420, radius 40) that opens a listing.
 * The shoe image bleeds past the top and right edges and is clipped by the rounded box. The title
 * is only spoken ahead of the headline when the headline says something else.
 */
export function CollectionBanner({ title, headline, description, image }: CollectionBannerProps) {
  const titled = headline.join(" ").toLowerCase() !== title.toLowerCase()
  return (
    <div className="relative isolate flex overflow-hidden rounded-3xl bg-foreground text-background md:rounded-banner 3xl:h-105">
      {image ? (
        <div className="absolute inset-y-0 end-0 -z-10 w-3/5 opacity-50 md:w-1/2 md:opacity-100 3xl:-top-23.5 3xl:bottom-auto 3xl:start-204.75 3xl:end-auto 3xl:h-146.75 3xl:w-220.25">
          <Image src={image.url} alt={image.alt} fill priority sizes="(min-width: 1920px) 881px, 50vw" className="object-cover" />
        </div>
      ) : null}
      <div className="flex flex-col gap-4 px-6 py-8 md:gap-8 md:px-10 md:py-12 3xl:ps-13.5 3xl:pe-0 3xl:pt-13.5 3xl:pb-0">
        <div className="flex flex-col gap-3 md:gap-4">
          <h1 className="flex flex-col text-48 leading-none font-black uppercase md:text-68 xl:text-100 3xl:text-120">
            {titled ? <span className="sr-only">{title}: </span> : null}
            <span>{headline[0]}</span>
            <span className="text-brand">{headline[1]}</span>
          </h1>
        </div>
        <p className="text-16 font-medium md:text-20 3xl:text-26">{description}</p>
      </div>
    </div>
  )
}
