import type { ActorScoped } from "@/server/db/actor"
import type { AdminProductQuery, AttributeDefinition, Brand, Collection, CustomFieldDefinition, Product } from "@/server/catalog/types"

/** Catalogue reads. Both drivers return only `active` products unless `includeDrafts` is set. */
export interface CatalogOperations {
  listProducts(storeId: string): Promise<Product[]>
  getProductBySlug(storeId: string, slug: string): Promise<Product | null>
  getProductsByVariantIds(variantIds: string[]): Promise<Product[]>
  listCollections(storeId: string): Promise<Collection[]>
  listBrands(storeId: string): Promise<Brand[]>
  listAttributeDefinitions(storeId: string): Promise<AttributeDefinition[]>
  listCustomFieldDefinitions(storeId: string): Promise<CustomFieldDefinition[]>
  /** Import: insert or update by slug; returns the number of rows written. */
  upsertProducts(storeId: string, products: Product[]): Promise<number>

  // ─── Staff (admin A3): every status ───────────────────────────────────────
  searchProducts(storeId: string, query: AdminProductQuery): Promise<{ products: Product[]; total: number }>
  /** Inventory reports include unpublished stock, without granting catalogue administration. */
  reportProducts(storeId: string, page: number): Promise<Product[]>
  getProductById(storeId: string, id: string): Promise<Product | null>
  /**
   * save_product: creates or updates one product by id with its images, variants and collection
   * links, in one transaction. With `expectedUpdatedAt`, refuses (conflict) when someone saved
   * first. A variant that was ever ordered can't be removed (archive the product instead).
   */
  saveProduct(storeId: string, product: Product, expectedUpdatedAt: string | null): Promise<Product>
  /** Deletes a product that was never ordered (with its sizes, photos, prices and stock rows). */
  deleteProduct(storeId: string, id: string): Promise<void>
  /** save_collection: creates or updates a collection; for manual ones, replaces its product list. */
  saveCollection(storeId: string, collection: Collection, productIds: string[] | null): Promise<Collection>
  deleteCollection(storeId: string, id: string): Promise<void>
  collectionProductIds(storeId: string, collectionId: string): Promise<string[]>
  createBrand(storeId: string, brand: Brand): Promise<Brand>
  /** Removes an unused brand. Products in any status must be reassigned first. */
  deleteBrand(storeId: string, id: string): Promise<void>
}

/** Raw storage boundary; services receive explicitly bound operations. */
export type CatalogRepository = ActorScoped<CatalogOperations>
