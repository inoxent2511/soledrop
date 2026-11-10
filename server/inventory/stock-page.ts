import type { StockPageQuery } from "./repository"
import { DomainError } from "@/server/shared/errors"

export function validateStockPage(query: StockPageQuery) {
  if (!Number.isSafeInteger(query.page) || query.page < 1 || query.page > 10000 || !Number.isSafeInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 1000 || query.low !== undefined && (!Number.isSafeInteger(query.low) || query.low < 0 || query.low > 1000) || query.q !== undefined && (typeof query.q !== "string" || query.q.length > 80)) throw new DomainError("validation", "Invalid inventory page.")
}
