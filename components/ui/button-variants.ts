import { cva } from "class-variance-authority"

/**
 * The design's buttons. Tones come from the screens (lime CTA, black CTA with lime text, white
 * on dark, outlined on dark and on light); sizes are the measured heights at 1920 and step down
 * below `3xl` so they stay proportionate on smaller screens (docs/app/components.md).
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-3 text-center whitespace-nowrap uppercase transition-[background-color,color,border-color,box-shadow,transform] duration-150 select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        brand: "bg-brand text-brand-foreground hover:bg-foreground hover:text-brand",
        /** Lime CTA on a black section: hovering to black would melt into the section, so it turns white. */
        "brand-on-ink": "bg-brand text-brand-foreground hover:bg-background hover:text-foreground",
        ink: "bg-foreground text-brand hover:bg-brand hover:text-brand-foreground",
        /** Black CTA on the lime bar: hovering to lime would melt into the bar, so it turns white. */
        "ink-on-brand": "bg-foreground text-brand hover:bg-background hover:text-foreground",
        "ink-light": "bg-foreground text-background hover:bg-brand hover:text-brand-foreground",
        paper: "bg-background text-foreground hover:bg-brand",
        "outline-dark": "border-2 border-border-strong text-background hover:border-brand hover:text-brand",
        outline: "border-2 border-foreground text-foreground hover:bg-foreground hover:text-background",
      },
      size: {
        card: "h-11 rounded-md px-3 text-14 font-bold sm:h-12 sm:px-4 sm:text-16",
        md: "h-12 px-5 text-16 font-bold md:h-13.5 md:px-6 md:text-18 3xl:text-20",
        lg: "h-13 rounded-lg px-5 text-16 font-bold md:h-15 md:px-6 md:text-18 3xl:h-18 3xl:text-22",
        xl: "h-13 rounded-xl px-5 text-17 font-bold md:h-16 md:px-6 md:text-20 3xl:h-19 3xl:text-24",
        hero: "h-12 rounded-lg px-5 text-16 font-bold md:h-14 md:w-48 md:text-20 3xl:h-18 3xl:w-60 3xl:text-26",
      },
    },
    defaultVariants: { tone: "brand", size: "card" },
  },
)
