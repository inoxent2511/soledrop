import type { ReactNode } from "react"

import { Container } from "@/components/shared/container"
import { cn } from "@/lib/utils"

type PageBandProps = {
  children: ReactNode
  /** Grey line under the title (Size Guide). */
  description?: string
  /** Montserrat title, as FAQs and Size Guide set it; Contact uses Inter. */
  display?: boolean
}

/** The black title band that opens the inside pages (Contact, FAQs, Size Guide: Frame 141, 200 px). */
export function PageBand({ children, description, display = false }: PageBandProps) {
  return (
    <div className="bg-foreground text-background">
      <Container className={cn("flex flex-col pt-10 pb-10", description ? "md:pt-12.25 md:pb-12" : "md:pt-16 md:pb-15.75")}>
        <h1 className={cn("text-32 leading-tight font-extrabold uppercase sm:text-34 md:text-50", display && "font-display")}>{children}</h1>
        {description ? <p className="pt-2 font-display text-16 font-semibold text-muted-foreground md:text-18">{description}</p> : null}
      </Container>
    </div>
  )
}
