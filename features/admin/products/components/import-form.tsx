"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { adminCatalogApi, type ImportReport } from "@/api/admin/catalog"
import { ApiError } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { FormAlert } from "@/components/admin/form"

/** Two steps: check the file (dry run), then import it. Nothing is written while any row has an error. */
export function ImportForm() {
  const router = useRouter()
  const [csv, setCsv] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [report, setReport] = useState<ImportReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(dryRun: boolean) {
    if (!csv) return
    setBusy(true)
    setError(null)
    try {
      const result = await adminCatalogApi.importProducts(csv, dryRun)
      setReport(result)
      if (!dryRun && !result.errors.length) router.refresh()
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "The import failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-14 font-bold">
        CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            setReport(null)
            setError(null)
            if (!file) return setCsv(null)
            if (file.size > 5 * 1024 * 1024) return setError("Files are limited to 5 MB.")
            setName(file.name)
            setCsv(await file.text())
          }}
          className="text-16 font-normal"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!csv || busy} onClick={() => void run(true)} className={adminButton({ tone: "secondary" })}>
          {busy ? "Checking…" : "Check file"}
        </button>
        <button type="button" disabled={!csv || busy || !report || report.errors.length > 0 || !report.dryRun} onClick={() => void run(false)} className={adminButton({ tone: "primary" })}>
          Import {report && !report.errors.length ? `${report.products} products` : ""}
        </button>
      </div>
      <FormAlert>{error}</FormAlert>
      {report ? (
        <div role="status" className="flex flex-col gap-2 rounded-md border border-border p-4 text-16">
          {report.errors.length ? (
            <>
              <p className="font-semibold text-destructive">
                {name}: {report.errors.length} problem{report.errors.length === 1 ? "" : "s"}. Nothing was imported.
              </p>
              <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto text-14">
                {report.errors.map((entry, index) => (
                  <li key={index}>
                    Row {entry.row}: {entry.message}
                  </li>
                ))}
              </ul>
            </>
          ) : report.dryRun ? (
            <p>
              {name} looks good: {report.products} products, {report.variants} sizes. Press Import to write them.
            </p>
          ) : (
            <p className="font-semibold">
              Imported {report.products} products and {report.variants} sizes.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
