import { currentStoreId, unitOfWork } from "@/server/db/driver"
import { apiV1 } from "@/server/http/api-v1"
import { productTransfer } from "@/server/import-export"
import { audit } from "@/server/platform/guards"
import { DomainError } from "@/server/shared/errors"

const MAX_BYTES = 5 * 1024 * 1024

/** POST text/csv; `?dryRun=1` validates without writing. All-or-nothing on validation errors. */
export const POST = apiV1("write", async (request, client) => {
  const csv = await request.text()
  if (csv.length > MAX_BYTES) throw new DomainError("validation", "Files are limited to 5 MB.")
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1"
  return unitOfWork(async () => {
  const report = await productTransfer().importCsv(currentStoreId(), csv, { dryRun, actor: `api:${client.identity}` })
  if (!report.dryRun) await audit(`api:${client.identity}`, "products.import", "product", "*", null, { products: report.products, variants: report.variants })
  return Response.json(report, { status: report.errors.length ? 422 : 200 })
  })
})
