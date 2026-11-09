import type { SortKey } from "@/server/catalog/types"

/** The listing's sort choices, in menu order (D-064). */
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "title-asc", label: "Title: A-Z" },
  { value: "title-desc", label: "Title: Z-A" },
  { value: "newest", label: "Date: New to Old" },
  { value: "oldest", label: "Date: Old to New" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "discount-desc", label: "Discount: High to Low" },
]
