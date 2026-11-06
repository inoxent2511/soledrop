import type { ConditionGrade } from "@/server/catalog/types"

/**
 * What each pre-loved grade means, in the owner's words (D-069, the revised Condition Guide). Best
 * first; the tone is the grade's colour in the guide, the explorer, the dialog and the card popover.
 */
export const CONDITION_GUIDE: {
  grade: ConditionGrade
  text: string
  tone: string
}[] = [
  {
    grade: "like-new",
    text: "In outstanding condition with almost no noticeable signs of wear. Looks and feels remarkably close to a fresh pair.",
    tone: "bg-guide-like-new",
  },
  {
    grade: "premium",
    text: "Beautifully maintained with minimal signs of previous use. Only slight cosmetic wear may be visible upon closer inspection.",
    tone: "bg-guide-premium",
  },
  {
    grade: "excellent",
    text: "A well-kept pair with light signs of regular use. Clean overall, with minor creasing or surface marks.",
    tone: "bg-guide-excellent",
  },
  {
    grade: "very-good",
    text: "Previously worn with noticeable signs of everyday use. Some visible wear, but still in reliable, wearable condition.",
    tone: "bg-guide-very-good",
  },
  {
    grade: "minor-issue",
    text: "May have a small defect, visible flaw, or previous repair. Any issues are clearly shown in the photos and reflected in the price.",
    tone: "bg-guide-minor-issue",
  },
]

/** The Condition Guide's heading and closing line, in the owner's words (D-069). */
export const CONDITION_GUIDE_TITLE = "Our Shoe Condition Guide"
export const CONDITION_GUIDE_NOTE =
  "Every pre-loved pair is carefully inspected and graded according to its actual condition. Product photos show the pair you will receive."
