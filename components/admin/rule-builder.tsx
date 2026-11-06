"use client"

import { Plus, Trash2 } from "lucide-react"

import { adminButton } from "@/components/admin/button"
import { adminControl } from "@/components/admin/form"
import type { CollectionRule } from "@/server/catalog/types"
import { cn } from "@/lib/utils"

const FIELDS: { value: CollectionRule["field"]; label: string }[] = [
  { value: "kind", label: "Type is" },
  { value: "gender", label: "For" },
  { value: "tag", label: "Has tag" },
  { value: "onSale", label: "On sale" },
  { value: "publishedWithinDays", label: "Added in the last" },
]

const GENDERS = ["men", "women", "unisex", "kids"] as const

const blank = (field: CollectionRule["field"]): CollectionRule =>
  field === "kind" ? { field, equals: "new" } : field === "gender" ? { field, in: ["men"] } : field === "tag" ? { field, equals: "" } : field === "onSale" ? { field, equals: true } : { field, days: 30 }

/** Rules for a rule-based collection; a product joins when every rule matches. */
export function RuleBuilder({ rules, onChange, disabled }: { rules: CollectionRule[]; onChange: (rules: CollectionRule[]) => void; disabled?: boolean }) {
  const set = (index: number, rule: CollectionRule) => onChange(rules.map((entry, at) => (at === index ? rule : entry)))
  const select = cn(adminControl, "h-9 w-auto")
  return (
    <div className="flex flex-col gap-3">
      <p className="text-14 text-subtle-foreground">Products appear when they match every rule.</p>
      <ul className="flex flex-col gap-2">
        {rules.map((rule, index) => (
          <li key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
            <select aria-label={`Rule ${index + 1}`} value={rule.field} disabled={disabled} onChange={(event) => set(index, blank(event.target.value as CollectionRule["field"]))} className={select}>
              {FIELDS.map((field) => (
                <option key={field.value} value={field.value}>
                  {field.label}
                </option>
              ))}
            </select>
            {rule.field === "kind" ? (
              <select aria-label="Type" value={rule.equals} disabled={disabled} onChange={(event) => set(index, { field: "kind", equals: event.target.value as "new" | "preloved" })} className={select}>
                <option value="new">Brand new</option>
                <option value="preloved">Pre-loved</option>
              </select>
            ) : null}
            {rule.field === "gender"
              ? GENDERS.map((gender) => (
                  <label key={gender} className="flex items-center gap-1 text-14 capitalize">
                    <input
                      type="checkbox"
                      checked={rule.in.includes(gender)}
                      disabled={disabled}
                      onChange={(event) => set(index, { field: "gender", in: event.target.checked ? [...rule.in, gender] : rule.in.filter((value) => value !== gender) })}
                      className="size-4 accent-foreground"
                    />
                    {gender}
                  </label>
                ))
              : null}
            {rule.field === "tag" ? <input aria-label="Tag" value={rule.equals} disabled={disabled} maxLength={40} onChange={(event) => set(index, { field: "tag", equals: event.target.value })} className={cn(adminControl, "h-9 w-48")} /> : null}
            {rule.field === "onSale" ? (
              <select aria-label="On sale" value={String(rule.equals)} disabled={disabled} onChange={(event) => set(index, { field: "onSale", equals: event.target.value === "true" })} className={select}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            ) : null}
            {rule.field === "publishedWithinDays" ? (
              <span className="flex items-center gap-1 text-14">
                <input aria-label="Days" type="number" min={1} max={365} value={rule.days} disabled={disabled} onChange={(event) => set(index, { field: "publishedWithinDays", days: Number(event.target.value) || 1 })} className={cn(adminControl, "h-9 w-20")} /> days
              </span>
            ) : null}
            {!disabled ? (
              <button type="button" aria-label={`Remove rule ${index + 1}`} onClick={() => onChange(rules.filter((_, at) => at !== index))} className={cn(adminButton({ tone: "ghost", size: "icon" }), "ms-auto")}>
                <Trash2 />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {!disabled ? (
        <div>
          <button type="button" onClick={() => onChange([...rules, blank("kind")])} className={adminButton({ tone: "secondary", size: "sm" })}>
            <Plus aria-hidden /> Add rule
          </button>
        </div>
      ) : null}
    </div>
  )
}
