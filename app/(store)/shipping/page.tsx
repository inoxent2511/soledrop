import type { Metadata } from "next"

import { Container } from "@/components/shared/container"
import { PageBand } from "@/components/shared/page-band"
import { shippingDocument } from "@/content/shipping"
import { DeliveryRates } from "@/features/content/components/delivery-rates"
import { PolicyDocument } from "@/features/content/components/policy-document"
import { deliveryRates } from "@/server/storefront"

/** The delivery rates come from the store's settings; refreshed every five minutes (docs/app/caching.md). */
export const revalidate = 300

export const metadata: Metadata = {
  title: shippingDocument.title,
  description:
    "Where Soledrop delivers in Pakistan, what delivery costs, how long it takes, tracking, and what happens if a parcel is late, damaged or wrong.",
  alternates: { canonical: "/shipping" },
}

/** Shipping & Delivery Policy (D-056): the owner's policy, laid out like Terms & Conditions, with the live delivery rates. */
export default async function ShippingPage() {
  const { rates, standardShipping } = await deliveryRates()
  return (
    <div id="top" className="bg-surface">
      <PageBand display description={shippingDocument.subtitle}>
        {shippingDocument.title}
      </PageBand>
      <Container className="pt-8 pb-16 md:pt-12 lg:pt-16 lg:pb-24 3xl:px-50">
        <PolicyDocument
          document={shippingDocument}
          values={standardShipping ? { standardShipping } : {}}
          extras={{ "delivery-charges": <DeliveryRates rates={rates} /> }}
        />
      </Container>
    </div>
  )
}
