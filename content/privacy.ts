/**
 * Privacy Policy (D-055): the owner's text (Privacy Policy.pdf), word for word, for /privacy.
 * The owner's preparation note is omitted from the shopper-facing policy.
 */
import { legalPublicationDate, type LegalDocument, type LegalParagraph, type LegalSection } from "@/content/legal"

const effectiveDate = legalPublicationDate

const privacyIntro: LegalParagraph = [
  "Your trust matters to SOLEDROP. This Privacy Policy explains what personal information we collect, why we need it, who helps us process it, and how you can contact us about your information. It applies to our website and customer service interactions.",
]

const privacyHighlights = [
  {
    title: "No list selling",
    text: "We do not sell customer contact lists as a business product.",
    section: "who-receives",
  },
  {
    title: "Card details stay safe",
    text: "Card numbers and security codes are handled by the payment provider, not asked for in chat.",
    section: "information-we-collect",
  },
  {
    title: "Opt out any time",
    text: "Decline promotional messages with the unsubscribe option or by contacting us.",
    section: "why-we-use",
  },
  {
    title: "Your data, your call",
    text: "Ask to see, correct or delete the information we hold about you.",
    section: "your-choices",
  },
]

const privacySections: LegalSection[] = [
  {
    id: "who-controls",
    title: "Who controls your information",
    short: "Who controls your data",
    paragraphs: [
      [
        { field: "legalName" },
        ", at ",
        { field: "postalAddress" },
        ", manages the customer information described here. For privacy requests, contact ",
        { field: "privacyEmail" },
        ".",
      ],
    ],
  },
  {
    id: "information-we-collect",
    title: "Information we collect",
    short: "What we collect",
    cards: [
      {
        title: "Information you provide",
        tone: "brand",
        paragraph: [
          "Name, phone number, email, shipping and billing addresses, order notes, account details if you create an account, size preferences if shared, and your messages to support.",
        ],
      },
      {
        title: "Purchase information",
        tone: "plain",
        paragraph: [
          "Products ordered, amounts, order dates, payment status, delivery details, and returns or refund history.",
        ],
      },
      {
        title: "Technical information",
        tone: "plain",
        paragraph: [
          "Browser or device information, IP address, pages visited, referral information, approximate location inferred from technical data, and cookie identifiers where enabled.",
        ],
      },
      {
        title: "Payment information",
        tone: "brand",
        paragraph: [
          "Payment status, transaction references, and limited payment details returned by approved payment services. Card numbers and security codes should be handled by the payment provider, not requested by SOLEDROP through ordinary chat.",
        ],
      },
    ],
    paragraphs: [],
  },
  {
    id: "why-we-use",
    title: "Why we use information",
    short: "Why we use it",
    paragraphs: [
      [
        "We use information to receive and fulfill orders, arrange delivery, provide customer support, identify payments, process exchanges and refunds, prevent misuse, protect the website, keep business and accounting records, and improve the shopping experience. Where appropriate and permitted, we may send service updates or marketing messages; promotional messaging can be declined using the available unsubscribe method or by contacting us.",
      ],
    ],
  },
  {
    id: "cookies",
    title: "Cookies and similar technologies",
    short: "Cookies",
    paragraphs: [
      [
        "Essential cookies may support cart contents, checkout sessions, security, and website settings. If enabled, analytics cookies help us understand site performance, while advertising or marketing tools may measure campaigns or support relevant promotions. Details and choices should be provided in our Cookie Notice. Optional cookies and trackers will be handled in line with applicable consent requirements. Browser controls may also limit certain cookies.",
      ],
    ],
  },
  {
    id: "who-receives",
    title: "Who receives information",
    short: "Who receives it",
    paragraphs: [
      [
        "Only when needed for the purposes described above, we may share relevant details with delivery partners, payment processors, website hosting providers, customer-service systems, analytics or marketing vendors that are actually enabled, fraud-prevention providers, and professional advisers. We may share information with authorities when legally required. We do not sell customer contact lists as a business product. Each connected provider should be evaluated for its privacy and security practices.",
      ],
    ],
  },
  {
    id: "outside-pakistan",
    title: "Information stored or processed outside Pakistan",
    short: "Outside Pakistan",
    paragraphs: [
      [
        "Some website, payment, or communication service providers may store or process data in other countries. The actual locations depend on the services we use. Before publishing this policy, we will review provider arrangements and apply safeguards required by law and reasonable data-security practice.",
      ],
    ],
  },
  {
    id: "retention",
    title: "How long we keep data",
    short: "How long we keep it",
    paragraphs: [
      [
        "We retain information only as long as reasonably needed to provide services, manage returns and disputes, meet accounting or legal requirements, maintain security, or honor a legitimate business record-keeping need. Different records may have different retention periods. We will delete, de-identify, or securely dispose of information when it is no longer needed, unless legal retention requirements apply.",
      ],
    ],
  },
  {
    id: "security",
    title: "Security",
    short: "Security",
    paragraphs: [
      [
        "We use reasonable organizational and technical measures to reduce the risks of unauthorized access, loss, and misuse. No online system can be guaranteed entirely secure. Customers should keep account credentials private and avoid sending payment card security details over chat or email.",
      ],
    ],
  },
  {
    id: "your-choices",
    title: "Your choices and privacy requests",
    short: "Your choices",
    paragraphs: [
      [
        "You can request access to information held about you, ask for inaccurate details to be corrected, request deletion where appropriate, update marketing preferences, or raise a privacy concern. We may need to verify your identity and may retain records required for lawful business, accounting, or dispute purposes. Send requests to ",
        { field: "privacyEmail" },
        ".",
      ],
    ],
  },
  {
    id: "accounts-children-links",
    title: "Accounts, children, and external links",
    short: "Accounts & children",
    paragraphs: [
      [
        "If customer accounts are enabled, you may be offered account settings for personal details and communication preferences. Our store is not directed at children, and purchases should be completed by an adult or with appropriate adult supervision. Links to third-party sites are governed by their own policies.",
      ],
    ],
  },
]

export const privacyDocument: LegalDocument = {
  title: "Privacy Policy",
  subtitle: "SOLEDROP | Customer Information",
  effectiveDate,
  noun: "this policy",
  intro: privacyIntro,
  highlights: privacyHighlights,
  sections: privacySections,
  // Section 11 of the owner's document.
  contact: {
    id: "updates-and-contact",
    title: "Policy updates and contact",
    short: "Updates & contact",
    paragraphs: [
      [
        "We may update this page to reflect business, legal, or technology changes. We will show the latest effective date above. For questions, contact: ",
        { field: "privacyEmail" },
        ", ",
        { field: "contactNumber" },
        ", ",
        { field: "postalAddress" },
        ".",
      ],
    ],
  },
}
