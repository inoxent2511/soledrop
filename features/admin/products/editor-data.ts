import "server-only"

import type { EditorInitial } from "@/features/admin/products/components/product-editor"
import { can } from "@/server/admin/dal"
import type { StaffContext } from "@/server/admin/types"
import { staffCatalog } from "@/server/catalog"
import type { StaffProductDetail } from "@/server/catalog/staff"

const toMajor = (amount: number | null | undefined) => (amount === null || amount === undefined ? "" : String(amount / 100))

/** Everything the product editor needs, shaped for the client (prices in major units as text). */
export async function editorProps(staff: StaffContext, detail: StaffProductDetail | null) {
  const service = staffCatalog()
  const [brands, collections] = await Promise.all([service.brands(staff), staff.permissions.includes("collections:read") ? service.collections(staff) : Promise.resolve([])])
  const product = detail?.product
  const initial: EditorInitial = product
    ? {
        id: product.id,
        updatedAt: detail.updatedAt,
        status: product.status,
        title: product.title,
        slug: product.slug,
        brandId: product.brand.id,
        kind: product.kind,
        gender: product.gender,
        description: product.description,
        condition: product.condition,
        conditionNotes: product.conditionNotes ?? "",
        tags: product.tags,
        collections: product.collections,
        seo: product.seo,
        images: product.images.map((image) => ({ url: image.url, alt: image.alt, width: image.width, height: image.height, role: image.role ?? "gallery" })),
        variants: product.variants.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          eu: variant.size.eu,
          uk: variant.size.uk,
          us: variant.size.us,
          cm: variant.size.cm,
          weightGrams: String(variant.weightGrams),
          price: toMajor(detail.prices[variant.id]?.amount),
          compareAt: toMajor(detail.prices[variant.id]?.compareAt),
        })),
        stock: Object.fromEntries(Object.entries(detail.stock).map(([variantId, level]) => [variantId, level.onHand])),
      }
    : {
        status: "draft",
        title: "",
        slug: "",
        brandId: "",
        kind: "new",
        gender: "men",
        description: "",
        condition: null,
        conditionNotes: "",
        tags: [],
        collections: [],
        seo: {},
        images: [],
        variants: [{ sku: "", eu: "", uk: "", us: "", cm: "", weightGrams: "0", price: "", compareAt: "" }],
        stock: {},
      }
  return {
    initial,
    brands: brands.map((brand) => ({ id: brand.id, name: brand.name })),
    collections: collections.filter((collection) => collection.kind === "manual").map((collection) => ({ slug: collection.slug, title: collection.title })),
    can: { write: can(staff, "products:write"), publish: can(staff, "products:publish"), price: can(staff, "pricing:write"), delete: can(staff, "products:delete"), upload: can(staff, "media:write") },
  }
}
