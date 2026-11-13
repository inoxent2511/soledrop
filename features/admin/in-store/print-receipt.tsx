"use client"

export function PrintReceipt() {
  return <button type="button" onClick={() => window.print()} className="rounded-md bg-brand px-4 py-2 text-14 font-semibold text-brand-foreground hover:opacity-90">Print receipt / Save PDF</button>
}
