import { expect, it } from "vitest"
import { publicEnv } from "@/lib/env"
import { serverEnv } from "@/lib/env.server"
import { serverSiteUrl } from "@/lib/site-server"
import { assertRequestOrigin } from "@/server/http/origin"
import { openApiDocument } from "@/server/http/openapi"

it("uses the runtime canonical origin while retaining exact CSRF checks", () => {
  const before = serverEnv.SITE_URL
  try {
    serverEnv.SITE_URL = "https://runtime-store.example.test"
    expect(serverSiteUrl()).toBe("https://runtime-store.example.test")
    expect(openApiDocument().servers).toEqual([{ url: "https://runtime-store.example.test/api/v1" }])
    const request = (origin: string) => new Request("http://localhost:3000/api/admin/auth/login", { method: "POST", headers: { origin } })
    const options = { siteUrl: serverSiteUrl(), allowLoopbackHttp: false, requireOrigin: true }
    expect(() => assertRequestOrigin(request("https://runtime-store.example.test"), options)).not.toThrow()
    expect(() => assertRequestOrigin(request("https://runtime-store.example.test.evil.test"), options)).toThrow("Cross-site request blocked")
    expect(() => assertRequestOrigin(request(new URL(publicEnv.NEXT_PUBLIC_SITE_URL).origin), options)).toThrow("Cross-site request blocked")
    serverEnv.SITE_URL = undefined
    expect(serverSiteUrl()).toBe(publicEnv.NEXT_PUBLIC_SITE_URL)
  } finally { serverEnv.SITE_URL = before }
})
