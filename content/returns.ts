/**
 * Returns, Exchanges & Refunds Policy (D-057): the owner's text (Returns, Exchanges & Refunds
 * Policy.pdf), word for word, for /returns. Three "proposed" markers in the document are notes to
 * the owner, so they are omitted from shopper-facing text.
 */
import { legalPublicationDate, type LegalDocument, type LegalParagraph, type LegalSection } from "@/content/legal"
import type { ProductKind } from "@/server/catalog/types"

const effectiveDate = legalPublicationDate

const returnsIntro: LegalParagraph = [
  "We want every customer to know what to expect before ordering. This policy offers eligible returns requested within ",
  { strong: "7 calendar days of delivery" },
  " for both Brand New and Pre-Loved shoes. We also separately review faulty, incorrectly supplied, or materially misdescribed items. This policy supplements and does not replace mandatory legal consumer rights.",
]

const returnsHighlights = [
  {
    title: "7-day window",
    text: "Request a return within 7 calendar days of delivery, Brand New or Pre-Loved.",
    section: "start-a-return",
  },
  {
    title: "Try them on indoors",
    text: "Indoor fitting is fine. Outdoor wear rules out a preference return.",
    section: "brand-new-requirements",
  },
  {
    title: "Our mistake, our cost",
    text: "Wrong, damaged or misdescribed? We cover reasonable return shipping.",
    section: "incorrect-items",
  },
  {
    title: "Refunds your way",
    text: "Back through your original payment, or by bank transfer for Cash on Delivery.",
    section: "refund-timing",
  },
]

/** The sections the product page's Returns panel shows for each kind of pair (D-057). */
export const returnsExcerptSections = (kind: ProductKind) => [
  "start-a-return",
  kind === "preloved" ? "pre-loved-requirements" : "brand-new-requirements",
]

const returnsSections: LegalSection[] = [
  {
    id: "quick-comparison",
    title: "Quick comparison",
    short: "Quick comparison",
    table: {
      head: ["Topic", "Brand New Shoes", "Pre-Loved Shoes"],
      rows: [
        [
          "Return request window",
          "Within 7 calendar days of delivery",
          "Within 7 calendar days of delivery",
        ],
        [
          "Fit or change-of-mind return",
          "Eligible if unused and complete",
          "Eligible if only tried indoors and unchanged",
        ],
        [
          "Condition required",
          "No outdoor wear; tags, accessories, and supplied packaging retained",
          "No new wear or damage; SOLEDROP tag attached; items received retained",
        ],
        [
          "Exchange",
          "Different size or product, subject to inventory",
          "Alternative available pair; same-model stock not guaranteed",
        ],
        [
          "Wrong item or undisclosed defect",
          "We investigate and provide an appropriate remedy",
          "We investigate against the actual listing and disclosed condition",
        ],
        [
          "Return postage for preference return",
          "Customer pays, unless a promotion states otherwise",
          "Customer pays, unless a promotion states otherwise",
        ],
        [
          "Return postage for confirmed seller error",
          "Paid or reimbursed by SOLEDROP",
          "Paid or reimbursed by SOLEDROP",
        ],
      ],
    },
    paragraphs: [],
  },
  {
    id: "start-a-return",
    title: "Start a return",
    short: "Start a return",
    steps: [
      { title: "Contact us", detail: "Within 7 calendar days of delivery" },
      {
        title: "Get approval",
        detail: "We send instructions and the return address",
      },
      {
        title: "Send it back",
        detail: "Within 5 working days, traceable courier",
      },
      { title: "We inspect", detail: "Within 3 working days of arrival" },
      {
        title: "Refund started",
        detail: "Within 7 working days of inspection",
      },
    ],
    paragraphs: [
      [
        "Contact ",
        { field: "supportEmail" },
        " or ",
        { field: "contactNumber" },
        " within seven calendar days after delivery. Provide your order number, item name, the reason for the request, and photographs if there is a defect or listing issue. Please wait for return instructions and the correct return address before shipping. Once approved for return, send the parcel within five working days using a traceable courier. Keep the tracking slip until resolution.",
      ],
    ],
  },
  {
    id: "brand-new-requirements",
    title: "Brand New return requirements",
    short: "Brand New returns",
    paragraphs: [
      [
        "For a fit-related or change-of-mind return, the shoes must be unworn outdoors, clean, and in resalable condition, with supplied tags and accessories. If we provided an original branded shoebox, return that box as part of the complete product; do not place shipping labels directly on it. Indoor fitting on a clean surface is allowed. A returned new pair with outdoor wear, new damage, or missing essential contents may not qualify for a voluntary preference return, but product-defect rights remain separate.",
      ],
    ],
  },
  {
    id: "pre-loved-requirements",
    title: "Pre-Loved return requirements",
    short: "Pre-Loved returns",
    paragraphs: [
      [
        "Pre-Loved items must be returned in materially the same condition as delivered. Trying them on indoors is allowed. Do not wear them outside, wash or repair them, detach our product tag, or remove or exchange insoles, laces, or other included parts. Because stock is often one of a kind, a size-for-size exchange of the identical model cannot be promised. We can offer another available pair if the customer chooses one.",
      ],
    ],
  },
  {
    id: "incorrect-items",
    title: "Incorrect, damaged, or materially misdescribed items",
    short: "Wrong or damaged items",
    paragraphs: [
      [
        "Contact us as soon as you discover a problem. Helpful evidence includes photographs of the shoes, soles, size label, packaging, and the issue. Examples include the wrong size or pair sent, a condition materially worse than disclosed, or a defect that existed on delivery but was not described. We will review the listing, dispatch record, and evidence, and arrange an appropriate repair (if suitable and agreed), replacement (if available), price adjustment, or refund as required by applicable law and the circumstances. We cover reasonable return shipping when the issue is confirmed to be our responsibility. A seven-day voluntary return window does not remove any longer or different statutory remedy.",
      ],
    ],
  },
  {
    id: "not-hidden-defect",
    title: "What is not a hidden defect in a Pre-Loved listing",
    short: "Disclosed Pre-Loved wear",
    paragraphs: [
      [
        "Wear that is clearly shown or described before purchase, such as disclosed creasing, light scuffing, outsole wear, or missing original packaging, is part of the condition the customer agreed to buy. We will not use general “pre-loved” wording to excuse an undisclosed material defect, incorrect grading, an unsafe condition, or a misleading description.",
      ],
    ],
  },
  {
    id: "exchange-process",
    title: "Exchange process",
    short: "Exchanges",
    paragraphs: [
      [
        "An exchange depends on available stock and the price of the selected replacement. Any price difference is confirmed before processing. If the replacement costs more, the customer pays the difference; if it costs less, we provide the appropriate refund or another mutually agreed solution. A different item is never sent without the customer's consent. If no suitable replacement exists, a refund remains available for an eligible return.",
      ],
    ],
  },
  {
    id: "return-shipping",
    title: "Return shipping fees",
    short: "Return shipping",
    paragraphs: [
      [
        "For voluntary fit or preference returns, customers arrange and pay for return delivery unless checkout or a promotion specifically says otherwise. For our confirmed mistake or an eligible defect, we arrange or reimburse reasonable return shipping. Initial delivery charges on a preference return are generally not refundable once delivery has been provided, subject to applicable law. Where the full order was incorrect, lost, or defective because of our responsibility, appropriate original shipping charges will also be reviewed for refund.",
      ],
    ],
  },
  {
    id: "refund-timing",
    title: "Inspection and refund timing",
    short: "Inspection & refunds",
    paragraphs: [
      [
        "After the parcel arrives, we inspect the returned item against the relevant return requirements. ",
        { strong: "Service target:" },
        " inspection within three working days and initiation of an approved refund within seven working days after inspection. The payment provider or bank may need additional processing time, which we will explain where known. Prepaid payments are returned through the original method when practical; Cash on Delivery refunds can be arranged by verified bank transfer or another mutually agreed and secure method. Wallet or store credit is optional and will not be substituted for a legally required cash refund without customer agreement.",
      ],
    ],
  },
  {
    id: "partial-returns",
    title: "Partial returns and promotions",
    short: "Partial returns",
    paragraphs: [
      [
        "For a mixed order, you may request a return for one shoe without returning the other. Refunds reflect the price actually paid for that item after any applicable item-level discount. If an offer depended on a minimum total order value, any clearly disclosed promotion conditions may be recalculated fairly and in accordance with law. We will explain any calculation before finalizing the refund.",
      ],
    ],
  },
  {
    id: "exclusions",
    title: "Exclusions and non-excludable rights",
    short: "Exclusions & your rights",
    paragraphs: [
      [
        "Voluntary preference returns may be denied where an item has been worn outdoors, damaged after delivery, altered, or returned incomplete. If any specific clearance item or promotional category is excluded from preference returns, the exception must be expressly shown on its product page and at checkout ",
        { strong: "before purchase" },
        ". No “final sale” label can remove remedies required by law for defective or misdescribed products.",
      ],
    ],
  },
]

export const returnsDocument: LegalDocument = {
  title: "Returns, Exchanges & Refunds Policy",
  subtitle: "SOLEDROP | One Clear Process for New and Pre-Loved Shoes",
  effectiveDate,
  noun: "this policy",
  intro: returnsIntro,
  highlights: returnsHighlights,
  sections: returnsSections,
  // Section 12 of the owner's document.
  contact: {
    id: "contact-details",
    title: "Our contact details",
    short: "Contact details",
    paragraphs: [
      [
        "Return requests: ",
        { field: "supportEmail" },
        " / ",
        { field: "contactNumber" },
      ],
      [
        "Return address: ",
        { strong: "Provided by support upon authorization" },
      ],
      ["Business address: ", { field: "postalAddress" }],
      ["Please keep your order confirmation and courier receipt."],
    ],
    action: { label: "Find your order", href: "/orders/lookup" },
  },
}
