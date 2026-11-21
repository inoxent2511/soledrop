import Link from "next/link"

import { EmptyBagIcon } from "@/components/icons"

const action =
  "flex h-12 w-full items-center justify-center rounded-xl bg-foreground text-16 font-semibold text-background transition-colors hover:bg-brand hover:text-brand-foreground md:h-14 md:w-72 md:text-20"

/** Empty bag (design 09): illustration, heading, two lines of guidance and both shop entrances. */
export function EmptyBag() {
  return (
    <div className="flex flex-col items-center px-4 pt-14 pb-16 text-center md:pt-24 md:pb-24 3xl:pt-48 3xl:pb-56">
      {/* The drawing's strokes overhang its 140×108 frame by half a pixel; the frame sets the layout. */}
      <span className="flex h-18 w-24 items-center justify-center md:h-24 md:w-30">
        <EmptyBagIcon aria-hidden="true" className="h-auto w-24 shrink-0 md:w-30" />
      </span>
      <h1 id="bag-title" tabIndex={-1} className="pt-6 outline-none text-28 font-bold tracking-tight-2 md:pt-9 md:text-48">Your bag is waiting for a pair</h1>
      <p className="max-w-134 pt-3 text-16 leading-relaxed font-medium text-subtle-foreground md:text-18">
        Looks like you haven&rsquo;t added any shoes to your bag yet. Explore our latest drops and find your next favorite pair.
      </p>
      {/* Side by side from md: two 320 px buttons and the gap need 674 px, more than sm's 600 px column. */}
      <div className="flex w-full max-w-80 flex-col items-center gap-3 pt-7 md:w-auto md:max-w-none md:flex-row md:gap-6 md:pt-10">
        <Link href="/collections/brand-new" className={action}>
          Shop Brand New
        </Link>
        <Link href="/pre-loved" className={action}>
          Shop Pre-Loved
        </Link>
      </div>
    </div>
  )
}
