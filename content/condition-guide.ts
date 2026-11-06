import type { ConditionGrade } from "@/server/catalog/types"

/** The four parts of a pair every grade is judged on, in inspection order. */
export const inspectedParts = ["Upper", "Midsole", "Outsole", "Insole"] as const

export type GradeDetail = {
  grade: ConditionGrade
  /** One line on how much the pair has been worn. */
  wear: string
  /** 1 = barely worn … 5 = clearly worn; drives the wear meter. */
  level: 1 | 2 | 3 | 4 | 5
  /** What to expect on each inspected part, in `inspectedParts` order. */
  parts: [string, string, string, string]
}

/**
 * Condition Guide page: what each grade looks like, part by part. Best grade first. The grades
 * and their order are the owner's revised guide (D-069); these short lines follow its wording.
 */
export const gradeDetails: GradeDetail[] = [
  {
    grade: "like-new",
    wear: "Almost no signs of wear.",
    level: 1,
    parts: [
      "Spotless, no creases",
      "Bright, no compression",
      "Tread as new",
      "Clean, no imprint",
    ],
  },
  {
    grade: "premium",
    wear: "Minimal signs of previous use.",
    level: 2,
    parts: [
      "Clean, faint toe creasing",
      "Light creasing only",
      "90 %+ tread left",
      "Light foot imprint",
    ],
  },
  {
    grade: "excellent",
    wear: "Light signs of regular use.",
    level: 3,
    parts: [
      "Minor creasing or marks",
      "Some creasing, light marks",
      "Even wear, good grip",
      "Visible imprint, clean",
    ],
  },
  {
    grade: "very-good",
    wear: "Noticeable everyday wear, still reliable.",
    level: 4,
    parts: [
      "Creasing, small scuffs",
      "Marks or light yellowing",
      "Noticeable wear, still grips",
      "Worn but clean",
    ],
  },
  {
    grade: "minor-issue",
    wear: "A small flaw or repair, shown in the photos.",
    level: 5,
    parts: [
      "Small defect or repair possible",
      "Marks or discolouration",
      "Worn patches possible",
      "May show wear",
    ],
  },
]

/** How a pre-loved pair is graded, in order. */
export const gradingSteps = [
  {
    title: "Inspect",
    text: "Upper, midsole, outsole and insole, checked by hand.",
  },
  { title: "Clean", text: "Cleaned and sanitised before listing." },
  { title: "Grade", text: "Given one of the five grades above." },
  { title: "Photograph", text: "The exact pair, flaws included." },
] as const

/** What every pre-loved listing shows. */
export const listingPromises = [
  "The exact pair in the photos",
  "The size printed on the tag",
  "Every flaw pointed out",
] as const
