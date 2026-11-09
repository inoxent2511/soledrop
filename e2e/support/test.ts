import { test as base } from "@playwright/test"

import { clientAddress } from "./admin"

/** Each scenario is a separate visitor behind the trusted local QA proxy. */
export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, provide) => {
    await provide({ ...extraHTTPHeaders, "x-forwarded-for": clientAddress() })
  },
})
