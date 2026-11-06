import type { Metadata } from "next"

import { Container } from "@/components/shared/container"
import { PageBand } from "@/components/shared/page-band"
import { privacyDocument } from "@/content/privacy"
import { PolicyDocument } from "@/features/content/components/policy-document"

export const metadata: Metadata = {
  title: privacyDocument.title,
  description:
    "What personal information Soledrop collects, why, who helps process it, and how to ask about, correct or delete it.",
  alternates: { canonical: "/privacy" },
}

/** Privacy Policy (D-055): the owner's policy, laid out like Terms & Conditions (D-054). */
export default function PrivacyPage() {
  return (
    <div id="top" className="bg-surface">
      <PageBand display description={privacyDocument.subtitle}>
        {privacyDocument.title}
      </PageBand>
      <Container className="pt-8 pb-16 md:pt-12 lg:pt-16 lg:pb-24 3xl:px-50">
        <PolicyDocument document={privacyDocument} />
      </Container>
    </div>
  )
}
