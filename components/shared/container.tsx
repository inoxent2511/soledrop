import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"
import { containerClasses } from "./container-classes"

/**
 * Page-width wrapper: the one place that centres content. At the designed 1920 width it leaves the
 * design's 120 px gutters (1680 content); narrower viewports get proportionally smaller gutters.
 */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(containerClasses, className)} {...props} />
}
