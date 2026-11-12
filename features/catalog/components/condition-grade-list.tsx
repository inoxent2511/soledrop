import { CONDITION_GUIDE } from "@/features/catalog/lib/condition-grades"
import { conditionLabel } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ConditionGrade } from "@/server/catalog/types"

/** The four grades in their guide colours with this pair's grade outlined (the product page's grade dialog). */
export function ConditionGradeList({ grade }: { grade: ConditionGrade }) {
  return (
    <ul className="flex flex-col gap-2">
      {CONDITION_GUIDE.map((entry) => {
        const current = entry.grade === grade
        return (
          <li
            key={entry.grade}
            aria-current={current ? "true" : undefined}
            className={cn(
              "flex flex-col gap-1 rounded-xl px-4 py-3",
              entry.tone,
              current && "outline-2 outline-foreground"
            )}
          >
            <span className="text-18 font-bold">
              {conditionLabel(entry.grade)}
              {current ? <span className="sr-only"> (this pair)</span> : null}
            </span>
            <span className="text-16 text-subtle-foreground">{entry.text}</span>
          </li>
        )
      })}
    </ul>
  )
}
