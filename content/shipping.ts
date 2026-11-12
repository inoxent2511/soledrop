/**
 * Shipping & Delivery Policy (D-056): the owner's text (Shipping & Delivery Policy.pdf), word for
 * word, for /shipping. "Standard shipping" is filled from the store's live rates; section 3's note to
 * the owner ("Proposed operational target — confirm before publishing") is omitted from the shopper-facing policy.
 */
import { legalPublicationDate, type LegalDocument, type LegalParagraph, type LegalSection } from "@/content/legal"

const effectiveDate = legalPublicationDate

const shippingIntro: LegalParagraph = [
  "We want delivery information to be clear before you pay. This policy covers Brand New, Pre-Loved, and mixed orders placed for delivery within Pakistan.",
]

const shippingHighlights = [
  {
    title: "Across Pakistan",
    text: "Eligible addresses nationwide, through the couriers shown at checkout.",
    section: "where-we-deliver",
  },
  {
    title: "No surprise charges",
    text: "Your delivery charge is shown at checkout before you confirm.",
    section: "delivery-charges",
  },
  {
    title: "Packed in 1–2 days",
    text: "Then usually 3–7 working days with the courier.",
    section: "processing",
  },
  {
    title: "Damaged or wrong?",
    text: "Keep the packaging, take photos and contact us promptly.",
    section: "damaged-or-incorrect",
  },
]

/** The section ids the product page's Delivery panel shows (D-056). */
export const shippingExcerptSections = ["delivery-charges", "processing"]

const shippingSections: LegalSection[] = [
  {
    id: "where-we-deliver",
    title: "Where we deliver",
    short: "Where we deliver",
    paragraphs: [
      [
        "We intend to serve eligible addresses across Pakistan through the courier partners available at checkout. Some remote or restricted locations may require additional arrangements or may not be serviceable. International shipping is not offered unless we separately announce and configure it.",
      ],
    ],
  },
  {
    id: "delivery-charges",
    title: "Delivery charges",
    short: "Delivery charges",
    paragraphs: [
      [
        "Your delivery charge is calculated and displayed at checkout before order confirmation. ",
        { strong: "Standard shipping: " },
        { field: "standardShipping" },
        ". Any Cash on Delivery handling fee, remote-area surcharge, or free-shipping offer will be disclosed before payment. We do not add undisclosed delivery charges after an order is confirmed.",
      ],
    ],
  },
  {
    id: "processing",
    title: "Processing and delivery estimate",
    short: "Processing & delivery",
    steps: [
      { title: "Order placed", detail: "Confirmation sent" },
      { title: "Prepared", detail: "1–2 working days" },
      { title: "With the courier", detail: "3–7 working days after dispatch" },
      { title: "Delivered", detail: "To your door" },
    ],
    paragraphs: [
      [
        "Orders are generally prepared in ",
        { strong: "1–2 working days" },
        ", with courier delivery usually estimated at ",
        { strong: "3–7 working days after dispatch" },
        ". Working days exclude Sundays and applicable public holidays. Estimates can vary by destination, weather, holidays, courier operations, and order verification. Special promotions may extend processing time, and estimated dates are not guaranteed.",
      ],
    ],
  },
  {
    id: "tracking",
    title: "Order confirmation and tracking",
    short: "Confirmation & tracking",
    paragraphs: [
      [
        "After an order is placed, we send confirmation using the contact channel entered at checkout. When a courier tracking reference is available, we share it by email, SMS, WhatsApp, or another order-status method that we actually support. Customers can contact support with their order number for updates.",
      ],
    ],
  },
  {
    id: "inventory",
    title: "Brand New and Pre-Loved inventory",
    short: "Brand New & Pre-Loved",
    paragraphs: [
      [
        "An order may contain items from both categories. We aim to package shoes securely and keep the items identified on the invoice. Pre-Loved shoes are often single available pairs, so the final inventory check is important. If an item cannot be supplied, we contact the customer and refund the unavailable item instead of quietly replacing it.",
      ],
    ],
  },
  {
    id: "delivery-attempts",
    title: "Delivery attempts and address errors",
    short: "Delivery attempts",
    paragraphs: [
      [
        "Please provide a complete address and reachable phone number. If the courier cannot deliver due to an incorrect address, repeated failed attempts, or inability to contact the recipient, the order may return to us. We will contact the customer about reasonable next steps, including any clearly disclosed redelivery charges where applicable. We will not impose previously undisclosed penalties.",
      ],
    ],
  },
  {
    id: "damaged-or-incorrect",
    title: "Parcels that arrive damaged or incorrect",
    short: "Damaged or incorrect",
    paragraphs: [
      [
        "If the package appears damaged, keep the packaging and take photographs where possible. If an item is missing, incorrect, or materially different from the order, contact ",
        { field: "supportEmail" },
        " with your order number and supporting information promptly. We will investigate and cover reasonable corrective shipping costs when the issue is our error or an eligible product defect. Your statutory rights remain unaffected.",
      ],
    ],
  },
  {
    id: "delays",
    title: "Delays and non-delivery",
    short: "Delays & non-delivery",
    paragraphs: [
      [
        "If tracking does not progress or the estimated window is exceeded, contact support so we can follow up with the courier. For a verified lost shipment, we will offer a replacement when stock permits or an appropriate refund. For unique Pre-Loved pairs, an identical replacement may not be possible.",
      ],
    ],
  },
]

export const shippingDocument: LegalDocument = {
  title: "Shipping & Delivery Policy",
  subtitle: "SOLEDROP | Delivering Your Next Pair",
  effectiveDate,
  noun: "this policy",
  intro: shippingIntro,
  highlights: shippingHighlights,
  sections: shippingSections,
  // Section 9 of the owner's document.
  contact: {
    id: "delivery-questions",
    title: "Delivery questions",
    short: "Delivery questions",
    paragraphs: [
      [
        "Email ",
        { field: "supportEmail" },
        " or WhatsApp ",
        { field: "contactNumber" },
        ". Include your order number for faster assistance.",
      ],
    ],
    action: { label: "Track your order", href: "/orders/lookup" },
  },
}
