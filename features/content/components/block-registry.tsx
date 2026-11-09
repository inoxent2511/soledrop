import Link from "next/link"
import type { ReactNode } from "react"

import { buttonVariants } from "@/components/ui/button-variants"
import type { ContentBlock } from "@/server/content/types"
import { cn } from "@/lib/utils"

type BlockOf<T extends ContentBlock["type"]> = Extract<ContentBlock, { type: T }>
type Renderers = { [T in ContentBlock["type"]]: (block: BlockOf<T>, context: BlockContext) => ReactNode }

/** `compact` is the smaller type used inside the product page's accordion panels. */
export type BlockContext = { compact: boolean; faqSlot?: (category: string) => ReactNode }

/**
 * Block registry: one renderer per content block type. Pages, policy panels and future
 * merchant-built pages are lists of blocks; adding a type means adding it to ContentBlock and here.
 */
const renderers: Renderers = {
  heading: (block, { compact }) => {
    const Heading = block.level === 2 ? "h2" : "h3"
    const Tag = compact ? "h3" : Heading
    return <Tag className={cn("font-bold", compact ? "text-18 md:text-20" : block.level === 2 ? "text-26 md:text-32" : "text-20 md:text-24")}>{block.text}</Tag>
  },
  paragraph: (block, { compact }) => <p className={cn("text-subtle-foreground", compact ? "text-16 md:text-18" : "text-18 md:text-20")}>{block.text}</p>,
  list: (block, { compact }) => {
    const List = block.ordered ? "ol" : "ul"
    return (
      <List className={cn("flex flex-col gap-2 ps-6 text-subtle-foreground", block.ordered ? "list-decimal" : "list-disc", compact ? "text-16 md:text-18" : "text-18 md:text-20")}>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </List>
    )
  },
  callout: (block) => (
    <aside className="flex flex-col gap-2 rounded-xl border-s-4 border-brand bg-surface px-6 py-5">
      <p className="text-18 font-bold">{block.title}</p>
      <p className="text-16 text-subtle-foreground md:text-18">{block.text}</p>
    </aside>
  ),
  faq: (block, { faqSlot }) => faqSlot?.(block.category) ?? null,
  cta: (block, { compact }) => (
    <div className="flex flex-wrap items-center gap-4">
      <p className={cn("font-semibold", compact ? "text-16 md:text-18" : "text-18 md:text-20")}>{block.text}</p>
      <Link href={block.href} className={cn(buttonVariants({ tone: "ink-light", size: "card" }))}>
        {block.label}
      </Link>
    </div>
  ),
}

export function Blocks({ blocks, compact = false, faqSlot, className }: { blocks: ContentBlock[]; compact?: boolean; faqSlot?: BlockContext["faqSlot"]; className?: string }) {
  const context: BlockContext = { compact, faqSlot }
  return (
    <div className={cn("flex flex-col", compact ? "gap-3" : "gap-5", className)}>
      {blocks.map((block, index) => (
        <BlockView key={`${block.type}-${index}`} block={block} context={context} />
      ))}
    </div>
  )
}

function BlockView({ block, context }: { block: ContentBlock; context: BlockContext }) {
  const render = renderers[block.type] as (block: ContentBlock, context: BlockContext) => ReactNode
  return render(block, context)
}
