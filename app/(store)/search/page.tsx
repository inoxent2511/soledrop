import type { Metadata } from "next"
import Link from "next/link"
import { after } from "next/server"

import { Container } from "@/components/shared/container"
import { popularCollections } from "@/content/navigation"
import { ListingBody } from "@/features/catalog/components/listing-body"
import { ListingToolbar } from "@/features/catalog/components/listing-toolbar"
import { ProductRow } from "@/features/catalog/components/product-row"
import { hasFilters, toListingState, type RawParams } from "@/features/catalog/lib/listing-url"
import { parseProductQuery } from "@/features/catalog/schemas/query"
import { toCardProduct } from "@/features/catalog/types/card"
import { cn } from "@/lib/utils"
import { logSearchEvent, MIN_QUERY_LENGTH, noResultsHelp, searchData } from "@/server/storefront"

type Props = { searchParams: Promise<RawParams> }

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true }, alternates: { canonical: "/search" } }

const control =
  "h-14 min-w-0 flex-1 rounded-lg border-2 border-control-border bg-background px-4 text-18 transition-colors hover:border-foreground focus-visible:border-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring md:h-18 md:text-22"
const chip = "flex min-h-11 items-center rounded-full border-2 border-foreground px-4 text-16 font-bold transition-colors hover:bg-foreground hover:text-background"

/**
 * Search (derived): a plain GET form, so it works before JavaScript loads and results are
 * shareable; results reuse the listing's filters, sort, view switch and pagination. A filter
 * alone (the Home page's brand links) lists that filter's pairs. A query that finds nothing
 * offers "did you mean", trending searches, categories and popular pairs; every query is logged
 * after the response is sent.
 */
export default async function SearchPage({ searchParams }: Props) {
  const raw = await searchParams
  const state = toListingState(raw)
  const query = parseProductQuery(raw)
  const q = query.q?.trim() ?? ""
  const searchable = q.length >= MIN_QUERY_LENGTH
  const data = searchable || (!q && hasFilters(state)) ? await searchData(searchable ? query : { ...query, q: undefined }) : null
  const help = searchable && data?.results.total === 0 ? await noResultsHelp(q) : null
  const view = state.view?.[0] === "list" ? "list" : "grid"
  const brandNames = (state.brand ?? []).map((slug) => data?.filters.brands.find((brand) => brand.value === slug)?.label ?? slug)
  const title = q ? `Results for “${q}”` : brandNames.length ? brandNames.join(", ") : "Search"

  if (searchable && data) {
    const total = data.results.total
    after(() => logSearchEvent({ query: q, resultCount: total, source: "page" }))
  }

  return (
    <div className="bg-surface">
      <div className="bg-foreground text-background">
        <Container className="flex flex-col gap-6 pt-10 pb-10 md:pt-12.25 md:pb-12 3xl:px-50">
          <h1 className="text-32 font-extrabold break-words uppercase md:text-50">{title}</h1>
          <form role="search" action="/search" className="flex w-full max-w-200 gap-3">
            <label htmlFor="search-q" className="sr-only">
              Search shoes, brands and styles
            </label>
            <input id="search-q" name="q" type="search" defaultValue={q} placeholder="Search shoes, brands and styles" minLength={2} maxLength={80} autoComplete="off" className={cn(control, "text-foreground")} />
            <button type="submit" className="h-14 shrink-0 rounded-lg bg-brand px-6 text-18 font-extrabold text-brand-foreground uppercase transition-colors hover:bg-background md:h-18 md:px-8 md:text-22">
              Search
            </button>
          </form>
        </Container>
      </div>
      <Container className="flex flex-col gap-8 pt-8 pb-16 md:gap-12 md:pt-12 3xl:pb-23.25">
        {data && help ? (
          <section aria-labelledby="no-results-title" className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <h2 id="no-results-title" role="status" className="text-22 font-extrabold md:text-28">
                No pairs match “{q}”
              </h2>
              {help.didYouMean ? (
                <p className="text-18 md:text-20">
                  Did you mean{" "}
                  <Link href={`/search?q=${encodeURIComponent(help.didYouMean)}`} className="font-bold underline underline-offset-4">
                    {help.didYouMean}
                  </Link>
                  ?
                </p>
              ) : (
                <p className="text-18 text-subtle-foreground md:text-20">Check the spelling, or try a brand, model or style.</p>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-14 font-extrabold tracking-wide-2 text-faint-foreground uppercase">Trending searches</h3>
              <ul className="flex flex-wrap gap-3">
                {help.trending.map((term) => (
                  <li key={term}>
                    <Link href={`/search?q=${encodeURIComponent(term)}`} className={chip}>
                      {term}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-14 font-extrabold tracking-wide-2 text-faint-foreground uppercase">Popular categories</h3>
              <ul className="flex flex-wrap gap-3">
                {popularCollections.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={chip}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {help.popular.length > 0 ? (
              <div className="flex flex-col gap-5">
                <h3 className="text-14 font-extrabold tracking-wide-2 text-faint-foreground uppercase">Popular right now</h3>
                <ProductRow products={help.popular.map(toCardProduct)} />
              </div>
            ) : null}
          </section>
        ) : data ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p role="status" className="text-18 font-semibold md:text-22">
                {data.results.total} {data.results.total === 1 ? "pair" : "pairs"} found
              </p>
              <ListingToolbar pathname="/search" state={state} view={view} />
            </div>
            <ListingBody pathname="/search" state={state} view={view} results={data.results} filters={data.filters} />
          </>
        ) : (
          <p className="text-18 text-subtle-foreground md:text-20">{q ? "Type at least two letters to search." : "Search by model, brand or style — for example “Air Max” or “running”."}</p>
        )}
      </Container>
    </div>
  )
}
