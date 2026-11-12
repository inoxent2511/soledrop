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
        card: "h-12 rounded-md px-4 text-16 font-bold",
        md: "h-13.5 px-6 text-18 font-bold 3xl:text-20",
        lg: "h-14 rounded-lg px-6 text-18 font-bold md:h-16 md:text-20 3xl:h-20 3xl:text-24",
        xl: "h-14 rounded-xl px-6 text-18 font-bold md:h-18 md:text-22 3xl:h-21 3xl:text-26",
        hero: "h-14 rounded-lg px-6 text-18 font-bold md:h-16 md:w-52 md:text-24 3xl:h-21 3xl:w-65 3xl:text-30",
      },
    },
    defaultVariants: { tone: "brand", size: "card" },
  },
)
