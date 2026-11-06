import { adminService } from "@/server/admin"
import { adminRoute } from "@/server/admin/route"
import { productTransfer } from "@/server/import-export"

/** The catalogue as CSV (one row per size; the import format). Formula-safe and audited. */
export const GET = adminRoute("products:export", async ({ staff, meta }) => {
  const csv = await productTransfer().exportCsv(staff.member.storeId)
  await adminService().recordAudit(staff, meta, { action: "product.exported", entity: "product", entityId: "*", after: { rows: csv.split("\r\n").length - 2 }, storeId: staff.member.storeId })
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"` } })
})
