import "server-only"

import { revalidatePath } from "next/cache"

/**
 * Refreshes every cached storefront page after a staff change (A-016). Outside a request (tests,
 * scripts, jobs) Next has no cache to refresh and throws; that case is a no-op.
 */
export function refreshStorefront(): void {
  try {
    revalidatePath("/", "layout")
  } catch (error) {
    if (!(error instanceof Error && /static generation store missing/i.test(error.message))) throw error
  }
}
