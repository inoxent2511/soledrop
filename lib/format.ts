import type { CurrencyCode } from "@/server/shared/money"

const MINOR_UNITS: Record<CurrencyCode, number> = { PKR: 100, USD: 100, AED: 100, GBP: 100 }

/** Local symbols the product page uses for its headline price ("Rs. 14,999"); other currencies keep their code. */
const SYMBOLS: Partial<Record<CurrencyCode, string>> = { PKR: "Rs." }

/**
 * Formats minor units as the design writes prices: currency code, space, grouped whole units
 * ("PKR 28,999"). Fractions only appear when the amount has them. `symbol` swaps the code for the
 * local symbol, as the product page's price and savings lines do.
 */
export function formatPrice(amount: number, currency: CurrencyCode = "PKR", { symbol = false }: { symbol?: boolean } = {}): string {
  const major = amount / MINOR_UNITS[currency]
  const digits = Number.isInteger(major) ? 0 : 2
  const prefix = symbol ? (SYMBOLS[currency] ?? currency) : currency
  return `${prefix} ${major.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

/** "12 Nov 2026" — dates on orders and the account area. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" })
}

/** Condition grade slug → label, as the Condition Guide writes it ("very-good" → "Very Good"). */
export function conditionLabel(grade: string): string {
  // Older order snapshots retain their original grade value in storage.
  if (grade === "like-new") return "Premium"
  return grade
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
