import { refreshStorefront } from "@/server/shared/revalidate"
import { adminService } from "@/server/admin"
import { adminRoute } from "@/server/admin/route"
import { productTransfer } from "@/server/import-export"
import { DomainError } from "@/server/shared/errors"
import { unitOfWork } from "@/server/db/driver"

const MAX_BYTES = 5 * 1024 * 1024

/**
 * POST the CSV as the body (text/csv). `?dryRun=1` only validates. All-or-nothing: any invalid
 * row means nothing is written. Sets prices and absolute stock too, as /api/v1 import does.
 */
export const POST = adminRoute(
  "products:import",
  async ({ request, staff, meta }) => {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES)
      throw new DomainError("validation", "Files are limited to 5 MB.")
    const csv = await request.text()
    if (csv.length > MAX_BYTES)
      throw new DomainError("validation", "Files are limited to 5 MB.")
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1"
    return unitOfWork(async () => {
    const report = await productTransfer().importCsv(
      staff.member.storeId,
      csv,
      { dryRun, actor: `staff:${staff.member.userId}` }
    )
    if (!report.dryRun) {
      await adminService().recordAudit(staff, meta, {
        action: "product.imported",
        entity: "product",
        entityId: "*",
        after: { products: report.products, variants: report.variants },
        storeId: staff.member.storeId,
      })
      refreshStorefront()
    }
    return Response.json(report, { status: report.errors.length ? 422 : 200 })
    })
  }
)
