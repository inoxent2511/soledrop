import type { Faq, Page } from "@/server/content/types"

/**
 * Policy pages and FAQs. The design leaves the FAQ body empty and has no policy pages, so this
 * copy is derived from the store facts the design does state (the free-delivery threshold,
 * Rs. 250 delivery, 7-day returns, cash on delivery, condition grading) — D-011 in
 * docs/app/design-decisions.md. Legal pages are marked for the owner's review (Needs from you).
 */

const updatedAt = "2026-11-03T00:00:00.000Z"

/**
 * The owner's FAQs (FAQs.pdf, D-066), all 18, grouped for the category index. `{supportEmail}`,
 * `{contactNumber}`, `{contactPage}` and `{standardShipping}` are filled at render time from the
 * site settings and the live delivery rate (features/content/components/faq-answer.tsx).
 */
const faqList: [string, string, string][] = [
  ["Shopping & sizing", "What does Soledrop sell?", "We offer Brand New shoes and individually assessed Pre-Loved shoes. Both can appear in the same shopping cart, and each item is labeled by category."],
  ["Shopping & sizing", "Can I order Brand New and Pre-Loved shoes together?", "Yes, where both items are in stock and eligible for the same checkout. We review any later return request for each product separately."],
  ["Shopping & sizing", "Are all shoes the same fit in EU size 42, for example?", "Not necessarily. Shoe sizing varies by brand and model. Use the stated EU size and any measurements provided, or ask support before purchasing."],
  ["Shopping & sizing", "Which payment methods are accepted?", "Only payment methods displayed at checkout are currently active. They may include COD or supported prepaid options as configured."],
  ["Shopping & sizing", "Can I cancel after placing an order?", "Contact us immediately. We aim to help before dispatch; after dispatch, the normal return process applies."],
  ["Pre-Loved shoes", "Are Pre-Loved shoes new?", "No. Premium is still a Pre-Loved grade. Brand New is a separate category for unused footwear."],
  ["Pre-Loved shoes", "How do I know the condition of a Pre-Loved pair?", "Check the actual product photos, condition grade, description, size information, and flaw notes. Our four Pre-Loved grades are Premium, Excellent, Very Good, and Minor Issue."],
  ["Pre-Loved shoes", "Do Pre-Loved shoes come with the original box?", "Only if the product listing says so. Packaging and included accessories may vary from one pair to another."],
  ["Pre-Loved shoes", "Is every Pre-Loved pair cleaned?", "We disclose our actual preparation process and do not promise medical sterilization. If you need information about how a particular pair was prepared, ask support."],
  ["Pre-Loved shoes", "Are Pre-Loved shoes guaranteed to last for a set time?", "No fixed remaining lifespan can be guaranteed. Prior wear, storage, materials, and age affect durability. This does not remove rights relating to an undisclosed defect or misrepresentation."],
  ["Delivery & tracking", "How much is delivery?", "The delivery amount is shown before order confirmation. Standard shipping: {standardShipping}."],
  ["Delivery & tracking", "How long will delivery take?", "Our standard is one to two working days to prepare an order, followed by an estimated three to seven working days after dispatch."],
  ["Delivery & tracking", "How can I track an order?", "We share a tracking reference or status update when our chosen courier provides it. Contact us with your order number if you need assistance."],
  ["Returns, exchanges & refunds", "Can I exchange shoes if the size is wrong?", "Our seven-day policy allows eligible indoor try-on exchanges or returns for both categories. Brand New shoes must remain unused, while Pre-Loved shoes must remain in the condition received. A matching Pre-Loved replacement cannot be guaranteed."],
  ["Returns, exchanges & refunds", "Can I return a Pre-Loved pair because I changed my mind?", "Yes, when you contact us within seven calendar days of delivery and the item qualifies for a preference return. Customer-paid return postage normally applies for this reason."],
  ["Returns, exchanges & refunds", "What if the shoes are damaged or different from the description?", "Contact support promptly with photographs and your order number. We separately investigate wrong items, undisclosed faults, and materially misleading descriptions. Mandatory legal remedies are not removed by the voluntary return conditions."],
  ["Returns, exchanges & refunds", "How do refunds work for COD orders?", "For an approved eligible refund, we can arrange a verified bank transfer or another agreed secure method. We will explain the destination and timing before processing."],
  ["Contact us", "How do I contact Soledrop?", "Email {supportEmail}, call or WhatsApp {contactNumber}, or use our website contact form at {contactPage}."],
]

export const contentSeed: { pages: Page[]; faqs: Faq[] } = {
  faqs: faqList.map(([category, question, answer], position) => ({
    id: `80000000-0000-4000-8000-${String(position + 1).padStart(12, "0")}`,
    category,
    question,
    answer,
    position,
  })),
  pages: [
    {
      slug: "about",
      title: "About Sole Drop",
      description: "New and pre-loved footwear from brands you love.",
      updatedAt,
      seo: {},
      blocks: [
        { type: "paragraph", text: "Sole Drop sells brand-new and pre-loved footwear from the brands you love — ASICS, Nike, adidas, HOKA, Brooks and more." },
        { type: "paragraph", text: "Every brand-new pair is sourced from authorised distributors. Every pre-loved pair is inspected, cleaned, graded and photographed, so the pair you see is the pair you get." },
        { type: "cta", text: "Fresh finds. Fresh steps.", label: "Shop new arrivals", href: "/collections/new-arrivals" },
      ],
    },
    {
      slug: "our-story",
      title: "Our Story",
      description: "Why we started Sole Drop.",
      updatedAt,
      seo: {},
      blocks: [
        { type: "paragraph", text: "Sole Drop started in Karachi with a simple idea: great shoes shouldn't be hard to find, and good shoes shouldn't go to waste." },
        { type: "paragraph", text: "So we built one place for new releases and second-chance pairs — honest about condition, quick to deliver, and easy to return." },
      ],
    },
  ],
}
