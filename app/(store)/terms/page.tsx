import type { Metadata } from "next"

import { Container } from "@/components/shared/container"
import { PageBand } from "@/components/shared/page-band"
import { termsDocument } from "@/content/terms"
import { PolicyDocument } from "@/features/content/components/policy-document"

export const metadata: Metadata = {
  title: termsDocument.title,
  description:
    "How shopping, ordering, paying and returns work at SOLEDROP, for Brand New and Pre-Loved footwear in Pakistan.",
  alternates: { canonical: "/terms" },
}

/** Terms & Conditions (D-054): the owner's terms on a page of their own, linked in the footer's Help column. */
export default function TermsPage() {
  return (
    <div id="top" className="bg-surface">
      <PageBand display description={termsDocument.subtitle}>
        {termsDocument.title}
      </PageBand>
      <Container className="pt-8 pb-16 md:pt-12 lg:pt-16 lg:pb-24 3xl:px-50">
        <PolicyDocument document={termsDocument} />
      </Container>
    </div>
  )
}
