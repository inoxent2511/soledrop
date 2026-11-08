import type { ActorScoped } from "@/server/db/actor"
import type { Collection, Facets, Product, ProductQuery } from "./types"
import type { SynonymMap } from "@/server/search/match"

export type StorefrontSelection = { products: Product[]; total: number; page: number; pageCount: number; facets: Facets }
export interface StorefrontQueries {
  selectPage(storeId: string, query: ProductQuery, priceListIds: string[], collection: Collection | undefined, synonyms: SynonymMap): Promise<StorefrontSelection>
  vocabulary(storeId: string): Promise<string[]>
  related(storeId: string, product: Product, limit: number): Promise<Product[]>
}
export type StorefrontRepository = ActorScoped<StorefrontQueries>
