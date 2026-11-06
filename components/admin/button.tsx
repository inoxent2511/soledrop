import { cva, type VariantProps } from "class-variance-authority"

/** Admin buttons: one lime primary per view, ink secondary, quiet ghost, and destructive (admin-design.md §1, §5). */
export const adminButton = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-bold whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        primary: "bg-brand text-brand-foreground hover:bg-foreground hover:text-brand",
        secondary: "border-2 border-foreground bg-background text-foreground hover:bg-foreground hover:text-background",
        ghost: "text-foreground hover:bg-surface-sunken",
        danger: "bg-destructive text-background hover:bg-foreground",
      },
      size: { sm: "h-9 px-3 text-14", md: "h-11 px-4 text-16", icon: "size-10" },
    },
    defaultVariants: { tone: "secondary", size: "md" },
  },
)

export type AdminButtonProps = VariantProps<typeof adminButton>
