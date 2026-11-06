/** Raw `searchParams` as a page receives them. */
export type RawParams = Record<string, string | string[] | undefined>

/** Listing keys the page scope (`kind`), filters, sort, view and pagination own (see parseProductQuery). */
const LISTING_KEYS = [
  "kind",
  "gender",
  "size",
  "brand",
  "min",
  "max",
  "condition",
  "sort",
  "page",
  "view",
  "q",
] as const
export type ListingKey = (typeof LISTING_KEYS)[number]

/** A plain, serialisable copy of the listing state that client components can rebuild URLs from. */
export type ListingState = Partial<Record<ListingKey, string[]>>

export function toListingState(params: RawParams): ListingState {
  const state: ListingState = {}
  for (const key of LISTING_KEYS) {
    const value = params[key]
    const values = (Array.isArray(value) ? value : value ? [value] : [])
      .flatMap((item) => item.split(","))
      .filter(Boolean)
    if (values.length) state[key] = values
  }
  // Only Men and Women are genders a shopper can tick (D-067); anything else (an old ?gender=kids) is dropped.
  if (state.gender) {
    const genders = state.gender.filter(
      (value) => value === "men" || value === "women"
    )
    if (genders.length) state.gender = genders
    else delete state.gender
  }
  return state
}

/**
 * The href for the listing with `changes` applied. Any filter or sort change returns to page 1;
 * `null` or an empty list removes the key.
 */
export function listingHref(
  pathname: string,
  state: ListingState,
  changes: Partial<Record<ListingKey, string[] | string | null>>
): string {
  const next: ListingState = { ...state }
  if (!("page" in changes)) delete next.page
  for (const [key, value] of Object.entries(changes) as [
    ListingKey,
    string[] | string | null,
  ][]) {
    const values = value === null ? [] : Array.isArray(value) ? value : [value]
    if (values.length) next[key] = values
    else delete next[key]
  }
  const search = new URLSearchParams()
  for (const key of LISTING_KEYS)
    if (next[key]?.length) search.set(key, next[key]!.join(","))
  const query = search.toString()
  return query ? `${pathname}?${query}` : pathname
}

/** Adds or removes one value of a multi-value key. */
export function toggleValue(
  values: string[] | undefined,
  value: string
): string[] {
  const current = values ?? []
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value]
}

/**
 * True when any filter (not sort, view or page) is applied. `kind` is not a filter: the header's
 * Brand New / Pre-Loved links open it as its own page (D-045), and filter changes keep it.
 */
export function hasFilters(state: ListingState): boolean {
  return ["gender", "size", "brand", "min", "max", "condition"].some(
    (key) => state[key as ListingKey]?.length
  )
}
