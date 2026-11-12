import type { Metadata } from "next"

import { Container } from "@/components/shared/container"
import { PageBand } from "@/components/shared/page-band"
import { returnsDocument } from "@/content/returns"
import { PolicyDocument } from "@/features/content/components/policy-document"

export const metadata: Metadata = {
  title: returnsDocument.title,
  description:
    "How returns, exchanges and refunds work at SOLEDROP for Brand New and Pre-Loved shoes: the 7-day window, conditions, return shipping and refund timing.",
  alternates: { canonical: "/returns" },
}

/** Returns, Exchanges & Refunds Policy (D-057): the owner's policy, laid out like Terms & Conditions. */
export default function ReturnsPage() {
  return (
    <div id="top" className="bg-surface">
      <PageBand display description={returnsDocument.subtitle}>
        {returnsDocument.title}
      </PageBand>
      <Container className="pt-8 pb-16 md:pt-12 lg:pt-16 lg:pb-24 3xl:px-50">
        <PolicyDocument document={returnsDocument} />
      </Container>
    </div>
  )
}
