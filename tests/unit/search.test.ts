import { bindActor } from "@/server/db/bind"
import { systemActor } from "@/server/db/actor"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import type { SearchOperations } from "@/server/search/repository"
import { createElement, Fragment } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it } from "vitest"

import { initialPreferences, MAX_RECENT_SEARCHES, MAX_RECENTLY_VIEWED, normalize, preferencesReducer } from "@/context/preferences-reducer"
import { highlight } from "@/features/search/lib/highlight"
import type { ViewedProduct } from "@/features/search/types"
import { STORE_ID } from "@/server/fixtures/seed"
import { db, resetFixtures } from "@/server/fixtures/store"
import { createFixturesSearchRepository } from "@/server/search/fixtures.repository"
import { editDistance, fold, score, suggestSpelling, wordMatches, type Searchable, type SynonymMap } from "@/server/search/match"
import { createSearchService } from "@/server/search/service"
import { noResultsHelp, searchCount, searchSuggest } from "@/server/storefront"

const airMax: Searchable = {
  title: "nike NIKE Air Max",
  body: "White / Orange / Lilac Lifestyle brand new Visible Air cushioning running",
  skus: ["SD-NIKE-AIR-MAX-42"],
  sizes: ["41", "42", "43", "44"],
}

describe("search matching", () => {
  it("folds case, accents and punctuation", () => {
    expect(fold("Pré-Loved  CAFÉ!")).toBe("pre loved cafe")
  })

  it("counts adjacent swaps as one edit and caps the distance", () => {
    expect(editDistance("nkie", "nike")).toBe(1)
    expect(editDistance("asics", "asisc")).toBe(1)
    expect(editDistance("adidas", "brooks", 2)).toBe(3)
  })

  it("tolerates typos by word length, never on short words", () => {
    expect(wordMatches("nkie", "nike")).toBe("fuzzy")
    expect(wordMatches("glycerni", "glycerin")).toBe("fuzzy")
    expect(wordMatches("nb", "nike")).toBeNull()
    expect(wordMatches("air", "airmax")).toBe("prefix")
    expect(wordMatches("max", "max")).toBe("exact")
  })

  it("requires every term, ranks title above body and exact above fuzzy", () => {
    expect(score(airMax, "air max")).toBeGreaterThan(0)
    expect(score(airMax, "air boots")).toBe(0)
    expect(score(airMax, "nike")).toBeGreaterThan(score(airMax, "lilac"))
    expect(score(airMax, "nike")).toBeGreaterThan(score(airMax, "nkie"))
  })

  it("matches diacritics-insensitively", () => {
    expect(score(airMax, "NÏKE")).toBe(score(airMax, "nike"))
  })

  it("expands synonyms, including multi-word phrases", () => {
    const synonyms: SynonymMap = new Map([["trainers", ["sneakers", "running"]], ["nb", ["new balance"]]])
    expect(score(airMax, "trainers")).toBe(0)
    expect(score(airMax, "trainers", synonyms)).toBeGreaterThan(0)
    expect(score({ ...airMax, title: "new balance 574" }, "nb", synonyms)).toBeGreaterThan(0)
  })

  it("finds SKUs (in any case or spacing) and EU size numbers", () => {
    expect(score(airMax, "sd-nike-air-max-42")).toBe(10)
    expect(score(airMax, "nike 42")).toBeGreaterThan(0)
    expect(score(airMax, "nike 38")).toBe(0)
  })

  it("suggests the closest catalogue spelling, or nothing", () => {
    const vocabulary = ["nike", "air", "max", "asics", "kayano", "brooks"]
    expect(suggestSpelling("nkie air mx", vocabulary)).toBe("nike air max")
    expect(suggestSpelling("nike", vocabulary)).toBeNull()
    expect(suggestSpelling("zzzzzz", vocabulary)).toBeNull()
  })
})

describe("search highlight", () => {
  it("marks typed words case- and accent-insensitively", () => {
    expect(renderToStaticMarkup(createElement(Fragment, null, highlight("Café Air Max", "cafe max")))).toBe(
      '<mark class="bg-transparent font-extrabold text-current">Café</mark> Air <mark class="bg-transparent font-extrabold text-current">Max</mark>',
    )
  })

  it("leaves text alone when nothing is typed", () => {
    expect(highlight("Air Max", "  ")).toBe("Air Max")
  })
})

const viewed = (slug: string): ViewedProduct => ({ slug, title: "Air Max", brand: "NIKE", image: null, price: { amount: 2899900, compareAt: null, currency: "PKR" } })

describe("preferences reducer", () => {
  it("keeps recent searches newest first, case-insensitively unique and capped", () => {
    let state = initialPreferences
    for (let index = 0; index < MAX_RECENT_SEARCHES + 2; index++) state = preferencesReducer(state, { type: "search", query: `query ${index}` })
    state = preferencesReducer(state, { type: "search", query: "QUERY 7" })
    expect(state.recentSearches).toHaveLength(MAX_RECENT_SEARCHES)
    expect(state.recentSearches[0]).toBe("QUERY 7")
    expect(state.recentSearches.filter((query) => query.toLowerCase() === "query 7")).toHaveLength(1)
    expect(preferencesReducer(state, { type: "forgetSearch", query: "query 7" }).recentSearches).not.toContain("QUERY 7")
    expect(preferencesReducer(state, { type: "clearSearches" }).recentSearches).toEqual([])
  })

  it("ignores blank searches and invalid viewed products", () => {
    expect(preferencesReducer(initialPreferences, { type: "search", query: "   " })).toBe(initialPreferences)
    expect(preferencesReducer(initialPreferences, { type: "viewed", product: { ...viewed("x"), slug: "../evil" } })).toBe(initialPreferences)
  })

  it("moves a re-viewed pair to the front and caps the list", () => {
    let state = initialPreferences
    for (let index = 0; index < MAX_RECENTLY_VIEWED + 1; index++) state = preferencesReducer(state, { type: "viewed", product: viewed(`pair-${index}`) })
    state = preferencesReducer(state, { type: "viewed", product: viewed("pair-3") })
    expect(state.recentlyViewed).toHaveLength(MAX_RECENTLY_VIEWED)
    expect(state.recentlyViewed[0]?.slug).toBe("pair-3")
  })

  it("normalises whatever storage holds", () => {
    expect(normalize(null)).toBe(initialPreferences)
    expect(normalize({ version: 99, recentSearches: ["a"] })).toBe(initialPreferences)
    const state = normalize({ version: 1, recentSearches: ["Nike", "nike", 4, " ", "x".repeat(200)], recentlyViewed: [viewed("a"), viewed("a"), { slug: 1 }], dismissed: ["n", "n"] })
    expect(state.recentSearches).toEqual(["Nike", "x".repeat(80)])
    expect(state.recentlyViewed.map((item) => item.slug)).toEqual(["a"])
    expect(state.dismissed).toEqual(["n"])
  })
})

describe("search service (fixtures driver)", () => {
  beforeEach(() => resetFixtures())

  it("builds a symmetric, folded synonym map", async () => {
    const map = await createSearchService({ search: bindActor<SearchOperations>(createFixturesSearchRepository(), () => systemActor(STORE_ID, "migration", ALL_PERMISSIONS)) }).synonymMap(STORE_ID)
    expect(map.get("trainers")).toContain("sneakers")
    expect(map.get("sneakers")).toContain("trainers")
    expect(map.get("preloved")).toContain("pre loved")
  })

  it("ranks trending by successful searches in the last 30 days and tops up from the curated list", async () => {
    const now = new Date("2026-11-04T12:00:00Z")
    const service = createSearchService({ search: bindActor<SearchOperations>(createFixturesSearchRepository(), () => systemActor(STORE_ID, "migration", ALL_PERMISSIONS)), now: () => now })
    await service.logSearch(STORE_ID, "Air Max", 4, "overlay")
    await service.logSearch(STORE_ID, "air max", 4, "page")
    await service.logSearch(STORE_ID, "Kayano", 2, "overlay")
    await service.logSearch(STORE_ID, "nothing here", 0, "overlay")
    await service.logClick(STORE_ID, "kayano", "asics-gel-kayano-30", "overlay")
    db().searchEvents.push({ id: crypto.randomUUID(), query: "old", normalized: "old", resultCount: 3, clickedSlug: null, source: "page", createdAt: "2026-01-01T00:00:00Z" })
    const trending = await service.trending(STORE_ID, ["Running", "air max"], 3)
    expect(trending.map((row) => row.query)).toEqual(["air max", "kayano", "running"])
    expect(trending[0]?.count).toBe(2)
  })

  it("does not log blank queries and trims long ones", async () => {
    const service = createSearchService({ search: bindActor<SearchOperations>(createFixturesSearchRepository(), () => systemActor(STORE_ID, "migration", ALL_PERMISSIONS)) })
    await service.logSearch(STORE_ID, "  !!  ", 0, "overlay")
    await service.logSearch(STORE_ID, "a".repeat(300), 0, "overlay")
    expect(db().searchEvents).toHaveLength(1)
    expect(db().searchEvents[0]?.query).toHaveLength(100)
  })
})

describe("search suggestions (storefront)", () => {
  beforeEach(() => resetFixtures())

  it("returns the landing panel for empty and one-letter queries", async () => {
    const landing = await searchSuggest(" a ")
    expect(landing.products).toEqual([])
    expect(landing.trending.length).toBeGreaterThan(0)
    expect(landing.collections.length).toBeGreaterThan(0)
  })

  it("finds products through typos, synonyms and SKUs", async () => {
    expect((await searchSuggest("nkie air")).products.map((product) => product.slug)).toContain("nike-air-max")
    expect((await searchSuggest("kayano")).products.map((product) => product.slug)).toContain("asics-gel-kayano-30")
    expect(await searchCount("trainers")).toBeGreaterThan(0)
    expect(await searchCount("sd-nike-air-max-42")).toBeGreaterThan(0)
  })

  it("offers brand links and caps products at eight", async () => {
    const result = await searchSuggest("nike")
    expect(result.brands).toContainEqual({ label: "Nike", href: "/search?brand=nike" })
    expect(result.products.length).toBeLessThanOrEqual(8)
    expect(result.total).toBeGreaterThanOrEqual(result.products.length)
  })

  it("answers a query with no matches with did-you-mean, trending and popular pairs", async () => {
    const result = await searchSuggest("glycerinn zzqx")
    expect(result.total).toBe(0)
    expect(result.trending.length).toBeGreaterThan(0)
    expect(result.popular.length).toBeGreaterThan(0)
    expect((await noResultsHelp("kayanno zzqx")).didYouMean).toBe("kayano zzqx")
  })
})
