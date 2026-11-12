import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { privacyDocument } from "@/content/privacy"
import { returnsDocument } from "@/content/returns"
import { shippingDocument } from "@/content/shipping"
import { termsDocument } from "@/content/terms"
import { PolicyDocument } from "@/features/content/components/policy-document"

describe.each([termsDocument, privacyDocument, shippingDocument, returnsDocument])("$title", (document) => {
  it("shows the publication date and business name without the draft notice", () => {
    const html = renderToStaticMarkup(createElement(PolicyDocument, { document }))
    expect(html).toContain("Effective date:")
    expect(html).toContain("11/11/2026")
    expect(html).toContain("SOLEDROP")
    expect(html).not.toContain("Soledrop")
    expect(html).not.toContain("[DATE OF PUBLICATION]")
    expect(html).not.toContain("[REGISTERED LEGAL BUSINESS NAME]")
    expect(html).not.toContain("Draft for the owner")
  })
})
