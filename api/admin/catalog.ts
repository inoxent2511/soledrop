// SWAP → none: talks to the real BFF (`app/api/admin/{products,brands,collections,inventory,media}`).
import { ApiError, request } from "@/api/http"
import type { CollectionInput } from "@/features/admin/collections/schema"
import type { ProductInput } from "@/features/admin/products/schema"
import type { MediaView } from "@/server/media/service"

export type ImportReport = { products: number; variants: number; errors: { row: number; message: string }[]; dryRun: boolean }

export const adminCatalogApi = {
  createProduct: (input: ProductInput) => request<{ id: string; updatedAt: string }>("/api/admin/products", { method: "POST", body: input }),
  saveProduct: (id: string, input: ProductInput, expectedUpdatedAt: string) => request<{ id: string; updatedAt: string }>(`/api/admin/products/${id}`, { method: "PUT", body: { ...input, expectedUpdatedAt } }),
  setStatus: (id: string, status: "draft" | "active" | "archived", expectedUpdatedAt?: string) => request<{ status: string; updatedAt: string }>(`/api/admin/products/${id}/status`, { method: "POST", body: { status, expectedUpdatedAt } }),
  deleteProduct: (id: string, reason: string) => request<void>(`/api/admin/products/${id}`, { method: "DELETE", body: { reason } }),
  createBrand: (name: string) => request<{ brand: { id: string; name: string; slug: string } }>("/api/admin/brands", { method: "POST", body: { name } }),

  /** Import posts the CSV as text; a 422 still carries the report, so it is returned, not thrown. */
  async importProducts(csv: string, dryRun: boolean): Promise<ImportReport> {
    const response = await fetch(`/api/admin/products/import${dryRun ? "?dryRun=1" : ""}`, { method: "POST", body: csv, headers: { "content-type": "text/csv" }, credentials: "same-origin" })
    const body = await response.json().catch(() => null)
    if (response.ok || (response.status === 422 && body && "errors" in body)) return body as ImportReport
    throw new ApiError(response.status, body?.error?.code ?? "internal", body?.error?.message ?? "The import failed.")
  },

  saveCollection: (input: CollectionInput, id?: string) => request<{ id: string }>(id ? `/api/admin/collections/${id}` : "/api/admin/collections", { method: id ? "PUT" : "POST", body: input }),
  deleteCollection: (id: string, reason: string | null) => request<void>(`/api/admin/collections/${id}`, { method: "DELETE", body: { reason } }),

  adjustStock: (variantId: string, delta: number, reason: string) => request<{ onHand: number }>(`/api/admin/inventory/${variantId}`, { method: "POST", body: { delta, reason } }),
  movements: (variantId: string) => request<{ movements: { id: string; delta: number; reason: string; actor: string; at: string }[] }>(`/api/admin/inventory/${variantId}`),

  media: (query: { q?: string; page?: number }, signal?: AbortSignal) =>
    request<{ items: MediaView[]; total: number }>(`/api/admin/media?${new URLSearchParams(Object.entries({ q: query.q ?? "", page: String(query.page ?? 1) }).filter(([, value]) => value))}`, { signal }),
  async upload(file: File, alt = ""): Promise<MediaView> {
    const form = new FormData()
    form.set("file", file)
    form.set("alt", alt)
    const response = await fetch("/api/admin/media", { method: "POST", body: form, credentials: "same-origin" })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new ApiError(response.status, body?.error?.code ?? "internal", body?.error?.message ?? "The upload failed.", body?.error?.details)
    return body.item as MediaView
  },
  setAlt: (id: string, alt: string) => request<{ item: MediaView }>(`/api/admin/media/${id}`, { method: "PATCH", body: { alt } }),
  deleteMedia: (id: string) => request<void>(`/api/admin/media/${id}`, { method: "DELETE" }),
}
