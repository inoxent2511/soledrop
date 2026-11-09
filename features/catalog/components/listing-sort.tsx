"use client"

import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SORT_OPTIONS } from "@/features/catalog/lib/sort-options"

export type ListingSortProps = { value: string; onValueChange: (value: string | null) => void }

const sortLabels = Object.fromEntries(SORT_OPTIONS.map((option) => [option.value, option.label]))

/** The existing sort dropdown, loaded when the document is ready or the shopper reaches it. */
export function ListingSort({ value, onValueChange }: ListingSortProps) {
  return <Select items={sortLabels} value={value} onValueChange={onValueChange}>
    <SelectTrigger aria-label="Sort by" className="h-14 ps-4 pe-4 md:h-18 md:ps-5 md:pe-5">
      <span className="flex min-w-0 items-center gap-3">
        <SelectLabel className="sr-only shrink-0 text-14 font-bold tracking-wide-2 text-subtle-foreground uppercase sm:not-sr-only md:text-16">Sort by</SelectLabel>
        <SelectValue className="text-18 md:text-20" />
      </span>
    </SelectTrigger>
    <SelectContent>{SORT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
  </Select>
}
