import { expect, it } from "vitest"
import robots from "@/app/robots"
import sitemap from "@/app/sitemap"
import { serverEnv } from "@/lib/env.server"
import { resetFixtures } from "@/server/fixtures/store"

it("uses the runtime canonical origin for discovery and every sitemap/image URL", async () => {
  resetFixtures()
  const before = serverEnv.SITE_URL
  try {
    serverEnv.SITE_URL = "https://runtime-store.example.test"
    const rules = await robots(), entries = await sitemap()
    expect(rules.host).toBe(serverEnv.SITE_URL)
    expect(rules.sitemap).toEqual([serverEnv.SITE_URL + "/sitemap.xml"])
    expect(entries.some((entry) => entry.url.includes("/products/"))).toBe(true)
    for (const entry of entries) {
      expect(entry.url.startsWith(serverEnv.SITE_URL + "/")).toBe(true)
      for (const image of entry.images ?? []) expect(image.startsWith(serverEnv.SITE_URL + "/")).toBe(true)
    }
  } finally { serverEnv.SITE_URL = before }
})
