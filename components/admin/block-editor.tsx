"use client"

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"

import { adminButton } from "@/components/admin/button"
import { adminControl } from "@/components/admin/form"
import { cn } from "@/lib/utils"
import type { ContentBlock } from "@/server/content/types"

const TYPES: { value: ContentBlock["type"]; label: string }[] = [
  { value: "heading", label: "Heading" },
  { value: "paragraph", label: "Paragraph" },
  { value: "list", label: "List" },
  { value: "callout", label: "Callout" },
  { value: "cta", label: "Button link" },
  { value: "faq", label: "FAQ group" },
]

const blank = (type: ContentBlock["type"]): ContentBlock =>
  type === "heading" ? { type, text: "", level: 2 } : type === "paragraph" ? { type, text: "" } : type === "list" ? { type, items: [""] } : type === "callout" ? { type, title: "", text: "" } : type === "cta" ? { type, label: "", href: "/", text: "" } : { type, category: "" }

/** Edits a page's blocks in order: add, change, move, remove (admin-design.md, BlockEditor). */
export function BlockEditor({ blocks, onChange, disabled, faqCategories }: { blocks: ContentBlock[]; onChange: (blocks: ContentBlock[]) => void; disabled?: boolean; faqCategories: string[] }) {
  const set = (index: number, block: ContentBlock) => onChange(blocks.map((entry, at) => (at === index ? block : entry)))
  const move = (index: number, by: number) => {
    const next = [...blocks]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item)
    onChange(next)
  }
  const field = cn(adminControl, "h-9")
  const area = cn(adminControl, "h-auto min-h-24 py-2")

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {blocks.map((block, index) => (
          <li key={index} className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-14 font-bold">
                {index + 1}. {TYPES.find((type) => type.value === block.type)?.label}
              </span>
              {!disabled ? (
                <span className="flex gap-1">
                  <button type="button" aria-label={`Move block ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)} className={adminButton({ tone: "ghost", size: "icon" })}>
                    <ArrowUp />
                  </button>
                  <button type="button" aria-label={`Move block ${index + 1} down`} disabled={index === blocks.length - 1} onClick={() => move(index, 1)} className={adminButton({ tone: "ghost", size: "icon" })}>
                    <ArrowDown />
                  </button>
                  <button type="button" aria-label={`Remove block ${index + 1}`} onClick={() => onChange(blocks.filter((_, at) => at !== index))} className={adminButton({ tone: "ghost", size: "icon" })}>
                    <Trash2 />
                  </button>
                </span>
              ) : null}
            </div>
            <fieldset disabled={disabled} className="flex flex-col gap-2">
              {block.type === "heading" ? (
                <div className="flex gap-2">
                  <select aria-label="Heading size" value={block.level} onChange={(event) => set(index, { ...block, level: Number(event.target.value) as 2 | 3 })} className={cn(field, "w-28")}>
                    <option value={2}>Large</option>
                    <option value={3}>Small</option>
                  </select>
                  <input aria-label="Heading text" value={block.text} maxLength={160} onChange={(event) => set(index, { ...block, text: event.target.value })} className={field} />
                </div>
              ) : null}
              {block.type === "paragraph" ? <textarea aria-label="Paragraph text" value={block.text} maxLength={5000} onChange={(event) => set(index, { ...block, text: event.target.value })} className={area} /> : null}
              {block.type === "list" ? (
                <>
                  <textarea aria-label="List items, one per line" value={block.items.join("\n")} onChange={(event) => set(index, { ...block, items: event.target.value.split("\n") })} className={area} />
                  <label className="flex items-center gap-2 text-14">
                    <input type="checkbox" checked={block.ordered ?? false} onChange={(event) => set(index, { ...block, ordered: event.target.checked })} className="size-4 accent-foreground" /> Numbered
                  </label>
                </>
              ) : null}
              {block.type === "callout" ? (
                <>
                  <input aria-label="Callout title" value={block.title} maxLength={120} onChange={(event) => set(index, { ...block, title: event.target.value })} className={field} />
                  <textarea aria-label="Callout text" value={block.text} maxLength={1000} onChange={(event) => set(index, { ...block, text: event.target.value })} className={area} />
                </>
              ) : null}
              {block.type === "cta" ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <input aria-label="Button label" placeholder="Label" value={block.label} maxLength={40} onChange={(event) => set(index, { ...block, label: event.target.value })} className={field} />
                  <input aria-label="Button link" placeholder="/contact" value={block.href} onChange={(event) => set(index, { ...block, href: event.target.value })} className={field} />
                  <input aria-label="Text beside the button" placeholder="Text" value={block.text} maxLength={300} onChange={(event) => set(index, { ...block, text: event.target.value })} className={field} />
                </div>
              ) : null}
              {block.type === "faq" ? (
                <select aria-label="FAQ group" value={block.category} onChange={(event) => set(index, { ...block, category: event.target.value })} className={field}>
                  <option value="">Choose a group</option>
                  {faqCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              ) : null}
            </fieldset>
          </li>
        ))}
      </ol>
      {!disabled ? (
        <div className="flex flex-wrap gap-2">
          {TYPES.map((type) => (
            <button key={type.value} type="button" onClick={() => onChange([...blocks, blank(type.value)])} className={adminButton({ tone: "secondary", size: "sm" })}>
              <Plus aria-hidden /> {type.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
