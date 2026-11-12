/**
 * Terms & Conditions (D-054): the owner's text (Terms & Condition.pdf), word for word, for /terms.
 * Business details the owner still has to supply live in `legalOwnerDetails` (content/legal.ts).
 */
import {
  legalLinks,
  legalPublicationDate,
  type LegalDocument,
  type LegalParagraph,
  type LegalSection,
} from "@/content/legal"

const { shipping, returns, privacy, conditionGuide } = legalLinks

const effectiveDate = legalPublicationDate

const termsIntro: LegalParagraph = [
  "Welcome to SOLEDROP. We sell Brand New and Pre-Loved footwear to customers in Pakistan. These Terms & Conditions explain how shopping, placing an order, paying, and using our website work. Please read them together with our ",
  shipping,
  ", ",
  returns,
  ", ",
  privacy,
  ", and ",
  conditionGuide,
  ". By placing an order, you agree to the terms applicable to that order. Nothing here limits rights that cannot legally be excluded.",
]

/** The "at a glance" strip: pointers into the full text, never a replacement for it. */
const termsHighlights: {
  title: string
  text: string
  section: string
}[] = [
  {
    title: "Prices in PKR",
    text: "The full total, delivery and any taxes are shown before you confirm.",
    section: "pricing",
  },
  {
    title: "Pay your way",
    text: "Cash on Delivery, bank transfer or online, as shown at checkout.",
    section: "payments",
  },
  {
    title: "Change or cancel",
    text: "Usually possible until your order is dispatched.",
    section: "changes",
  },
  {
    title: "7-day returns",
    text: "Request a return within seven calendar days of delivery.",
    section: "returns",
  },
]

const termsSections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    short: "Who we are",
    paragraphs: [
      [
        "“SOLEDROP,” “we,” “our,” and “us” refer to ",
        { field: "legalName" },
        ", at ",
        { field: "registeredAddress" },
        ". Our website is ",
        { field: "website" },
        ", and our support email is ",
        { field: "supportEmail" },
        ". Our support WhatsApp or phone number is ",
        { field: "contactNumber" },
        ".",
      ],
    ],
  },
  {
    id: "product-categories",
    title: "Our two product categories",
    short: "Product categories",
    cards: [
      {
        title: "Brand New",
        tone: "brand",
        paragraph: [
          "Footwear sold as unused. Any manufacturer or retailer packaging, accessories, or warranty is described on its individual listing. We will disclose a display pair, minor box damage, or other material exception instead of presenting it as standard new stock.",
        ],
      },
      {
        title: "Pre-Loved",
        tone: "plain",
        paragraph: [
          "Footwear owned or used before, with an individual condition grade and photographs or other expressly labeled visual references. Pre-Loved shoes may have cosmetic signs of wear and age-related characteristics described on the product page. Our four grades are ",
          { grades: true },
          ". See the ",
          conditionGuide,
          " for their meanings.",
        ],
      },
    ],
    paragraphs: [
      [
        "When a cart contains both categories, product-specific details remain applicable to each item. Return requests and product-condition concerns are assessed per item, not automatically for the entire order.",
      ],
    ],
  },
  {
    id: "product-information",
    title: "Product information and sizing",
    short: "Product info & sizing",
    paragraphs: [
      [
        "We aim to display accurate photographs, sizes, prices, quantities, and condition information. Screen settings and lighting can cause small color differences, but we will not treat a material mismatch as a harmless display difference. EU sizing and any available length measurements are shown for guidance; different models can fit differently. Customers should read the listing before ordering and may contact support for available sizing information. Any special defect, repair, missing accessory, or non-standard packaging known to us will be disclosed when material.",
      ],
    ],
  },
  {
    id: "pricing",
    title: "Pricing and promotions",
    short: "Pricing & promotions",
    paragraphs: [
      [
        "Prices are listed in Pakistani Rupees (PKR). The total payable amount, delivery charges, and applicable taxes or fees will be displayed before you confirm the order. Promotions apply only during the stated period and under their published eligibility rules. We may correct a clear pricing or description error and contact you before fulfilling an affected order; any payment taken for an order we cannot fulfill will be refunded. We do not charge an amount different from the confirmed checkout total without your agreement.",
      ],
    ],
  },
  {
    id: "orders",
    title: "Orders and acceptance",
    short: "Orders & acceptance",
    paragraphs: [
      [
        "Submitting an order is a request to purchase. We accept it once it has been confirmed for fulfillment by SOLEDROP. An automatic order-received message is not a guarantee that an item remains available. We may need to verify payment, address details, or an item’s condition. If a pair is unavailable or fails a final quality check, we will offer a suitable alternative only with your consent or cancel the affected item and refund any payment received for it.",
      ],
    ],
  },
  {
    id: "payments",
    title: "Payments",
    short: "Payments",
    paragraphs: [
      [
        "Available payment methods are those displayed at checkout. Depending on our active arrangements, these may include Cash on Delivery, bank transfer, or a supported online payment processor. We do not consider a method available until it appears at checkout. Online payments may be processed by third parties under their own security and service terms. Where payment verification is needed, fulfillment may begin after confirmation.",
      ],
    ],
  },
  {
    id: "changes",
    title: "Order changes, cancellation, and delivery",
    short: "Changes & cancellation",
    paragraphs: [
      [
        "Contact us promptly for address changes, order corrections, or cancellation requests. We can normally amend or cancel an order before it is dispatched; once handed to the courier, the ",
        returns,
        " applies. Delivery estimates are not guaranteed arrival dates. We will communicate substantial known delays when reasonably possible. Incorrect or incomplete delivery information may lead to delays or an unsuccessful delivery attempt.",
      ],
    ],
  },
  {
    id: "returns",
    title: "Returns, exchanges, refunds, and legal rights",
    short: "Returns & refunds",
    paragraphs: [
      [
        "Our published ",
        returns,
        " states the voluntary eligibility conditions and process, including a proposed seven-calendar-day request window from delivery. Faulty, misdescribed, or incorrectly supplied items are reviewed separately from change-of-mind cases. No condition or deadline in our policies removes non-excludable statutory consumer rights. Please do not post a return without first contacting customer support for instructions.",
      ],
    ],
  },
  {
    id: "product-care",
    title: "Product care and expected use",
    short: "Product care",
    paragraphs: [
      [
        "Use footwear for its intended purpose and follow the product’s available care instructions. For Pre-Loved shoes, age and prior use can affect soles, adhesives, foam, lining, and materials even when appearance is good. Our condition grade reflects observable condition at listing or inspection, not a promise of future performance. We do not claim used shoes are sterile or free from every microorganism. We do not exclude responsibility for an item that was defective, unsafe, or materially different from its description at the time of sale where applicable law provides a remedy.",
      ],
    ],
  },
  {
    id: "intellectual-property",
    title: "Brand names and intellectual property",
    short: "Brands & IP",
    paragraphs: [
      [
        "Third-party shoe brand names and logos are used only where necessary to identify products. Such use does not imply that SOLEDROP is an official retailer, licensee, or partner unless that relationship is expressly verified and stated. SOLEDROP’s own logo, copy, designs, and original photographs may not be reproduced commercially without permission, except where the law allows. Please report any suspected inaccurate brand labeling or intellectual-property concern to support.",
      ],
    ],
  },
  {
    id: "fair-use",
    title: "Fair use of our website",
    short: "Fair use",
    paragraphs: [
      [
        "You must provide accurate checkout details and must not misuse the website, attempt unauthorized access, submit fraudulent orders, copy others’ personal information, or interfere with the shopping service. We may limit suspicious orders or access where reasonably necessary to prevent fraud or protect customers, while respecting applicable law.",
      ],
    ],
  },
  {
    id: "website-changes",
    title: "Website changes and third-party services",
    short: "Website changes",
    paragraphs: [
      [
        "We may improve products, prices, services, and website content. Policy changes will be published with a new effective date and will not retroactively remove rights attached to an already accepted order. Couriers, hosting services, payment providers, and other external services may have their own terms and availability. We are responsible for our own obligations under applicable law.",
      ],
    ],
  },
  {
    id: "complaints",
    title: "Complaints and applicable law",
    short: "Complaints & law",
    paragraphs: [
      [
        "Please send order issues to ",
        { field: "supportEmail" },
        " with your order number, an explanation, and photographs where relevant. We aim to address complaints fairly. These terms are interpreted under applicable Pakistani law and relevant provincial consumer-protection rules. Customers may also use any statutory complaint or court process available to them.",
      ],
    ],
  },
]

export const termsDocument: LegalDocument = {
  title: "Terms & Conditions",
  subtitle: "SOLEDROP | Website & Orders",
  effectiveDate,
  noun: "these terms",
  intro: termsIntro,
  highlights: termsHighlights,
  sections: termsSections,
  // Section 14 of the owner's document.
  contact: {
    id: "contact",
    title: "Contact",
    short: "Contact",
    paragraphs: [],
  },
}
