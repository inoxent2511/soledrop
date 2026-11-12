import { StarIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

import { ArrowRightIcon } from "@/components/icons"
import {
  gradeDetails,
  inspectedParts,
  type GradeDetail,
} from "@/content/condition-guide"
import { CONDITION_GUIDE } from "@/features/catalog/lib/condition-grades"
import { conditionLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

const number = (index: number) => String(index + 1).padStart(2, "0")
const anchor = (detail: GradeDetail) => `grade-${detail.grade}`
const guideFor = (detail: GradeDetail) =>
  CONDITION_GUIDE.find((entry) => entry.grade === detail.grade)!

/**
 * The Condition Guide's grades as one vertical story (D-073, replaces D-046's explorer): a jump row,
 * then a block per grade, best first, alternating sides. Each block pairs the grade's illustration
 * on its colour with the owner's description, a 4-to-1 condition score, what to expect part by part
 * and a link to shop that grade. Everything is visible at once and needs no JavaScript.
 */
export function ConditionGradesGuide() {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <nav aria-label="Jump to a grade">
        <ul className="flex flex-wrap gap-2">
          {gradeDetails.map((detail, index) => (
            <li key={detail.grade}>
              <a
                href={`#${anchor(detail)}`}
                className="flex min-h-11 items-center gap-2.5 rounded-full border border-border bg-background ps-2 pe-4 text-16 font-semibold transition-colors hover:border-foreground"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full font-display text-14 font-bold",
                    guideFor(detail).tone
                  )}
                >
                  {number(index)}
                </span>
                {conditionLabel(detail.grade)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <ol className="flex flex-col gap-6 md:gap-8">
        {gradeDetails.map((detail, index) => (
          <GradeBlock key={detail.grade} detail={detail} index={index} />
        ))}
      </ol>
    </div>
  )
}

function GradeBlock({ detail, index }: { detail: GradeDetail; index: number }) {
  const guide = guideFor(detail)
  const label = conditionLabel(detail.grade)
  // Premium scores 4, Minor Issue 1: the wear level reads the other way round.
  const score = 5 - detail.level
  const titleId = `${anchor(detail)}-title`
  return (
    <li id={anchor(detail)} className="scroll-mt-20 lg:scroll-mt-27.5">
      <article
        aria-labelledby={titleId}
        className="grid items-center gap-6 rounded-panel bg-background p-5 md:gap-8 md:p-8 lg:grid-cols-2 lg:gap-12 lg:p-10"
      >
        <div
          className={cn(
            "relative flex aspect-video items-center justify-center overflow-hidden rounded-3xl",
            guide.tone,
            index % 2 === 1 && "lg:order-last"
          )}
        >
          <span
            aria-hidden="true"
            className="absolute start-4 top-4 flex size-12 items-center justify-center rounded-full bg-foreground font-display text-18 font-bold text-brand md:start-5 md:top-5 md:size-14 md:text-20"
          >
            {number(index)}
          </span>
          <Image
            src={`/images/site/condition-${detail.grade}.png`}
            alt={`Illustration: ${label}`}
            width={305}
            height={175}
            sizes="(min-width: 1024px) 28rem, 80vw"
            className="h-auto w-3/4"
          />
          <span
            aria-hidden="true"
            className="absolute end-4 bottom-4 rounded-full bg-background px-3.5 py-1.5 text-14 font-bold uppercase md:end-5 md:bottom-5"
          >
            {label}
          </span>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-14 font-bold tracking-wide-2 text-subtle-foreground uppercase">
              Grade {index + 1} of {gradeDetails.length}
            </p>
            <h3
              id={titleId}
              className="text-34 leading-none font-black tracking-tight-3 md:text-48"
            >
              {label}
            </h3>
            <p className="text-18 leading-relaxed text-subtle-foreground md:text-20">
              {guide.text}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span
              role="img"
              aria-label={`Condition score: ${score} out of 4`}
              className="flex gap-1"
            >
              {[1, 2, 3, 4].map((step) => (
                <StarIcon
                  key={step}
                  aria-hidden="true"
                  className={cn(
                    "size-5 md:size-6",
                    step <= score
                      ? "fill-foreground text-foreground"
                      : "text-faint-foreground"
                  )}
                />
              ))}
            </span>
            <span className="text-16 font-semibold">{detail.wear}</span>
          </div>

          <dl className="grid grid-cols-2 gap-2">
            {inspectedParts.map((part, partIndex) => (
              <div
                key={part}
                className="flex flex-col gap-0.5 rounded-xl bg-surface px-4 py-3"
              >
                <dt className="text-14 font-bold tracking-wide-2 text-subtle-foreground uppercase">
                  {part}
                </dt>
                <dd className="text-16 font-medium">
                  {detail.parts[partIndex]}
                </dd>
              </div>
            ))}
          </dl>

          <Link
            href={`/pre-loved?condition=${detail.grade}`}
            className="group flex w-fit items-center gap-2 text-16 font-bold underline-offset-4 hover:underline md:text-18"
          >
            Shop {label} pairs
            <ArrowRightIcon
              aria-hidden="true"
              className="h-auto w-3.5 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
            />
          </Link>
        </div>
      </article>
    </li>
  )
}
