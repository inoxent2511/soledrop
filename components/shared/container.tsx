import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"
import { containerClasses } from "./container-classes"

/**
 * Page-width wrapper: the one place that centres content. At 1920px it leaves
 * 128px gutters; narrower viewports get proportionally smaller gutters.
 */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(containerClasses, className)} {...props} />
}
