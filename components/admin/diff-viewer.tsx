/** Before/after of an audit entry, field by field; unchanged and absent sides show a dash. */
const show = (value: unknown) => (value === undefined || value === null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value))

export function DiffViewer({ before, after }: { before: unknown; after: unknown }) {
  const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : value === null || value === undefined ? {} : { value })
  const left = asRecord(before)
  const right = asRecord(after)
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])]
  if (keys.length === 0) return <p className="text-14 text-subtle-foreground">No details recorded.</p>
  return (
    <table className="w-full table-fixed border-collapse text-14">
      <thead className="text-subtle-foreground">
        <tr>
          <th scope="col" className="w-1/4 py-1 text-start font-semibold">
            Field
          </th>
          <th scope="col" className="py-1 text-start font-semibold">
            Before
          </th>
          <th scope="col" className="py-1 text-start font-semibold">
            After
          </th>
        </tr>
      </thead>
      <tbody>
        {keys.map((key) => {
          const changed = show(left[key]) !== show(right[key])
          return (
            <tr key={key} className="border-t border-border align-top">
              <th scope="row" className="py-1 pe-2 text-start font-semibold break-words">
                {key}
              </th>
              <td className="py-1 pe-2 font-mono break-words text-subtle-foreground">{show(left[key])}</td>
              <td className={changed ? "py-1 font-mono font-semibold break-words" : "py-1 font-mono break-words text-subtle-foreground"}>{show(right[key])}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
