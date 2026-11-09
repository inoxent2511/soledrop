import { expect } from "@playwright/test"
import { test } from "./support/test"

/**
 * Route and link crawl (E1). Starting from the home page and the sitemap, follows every same-origin
 * link in the server-rendered HTML (breadth first) and checks that each one answers below 400, that
 * every page has exactly one h1, and that no link points at an empty or placeholder href. The
 * crawl reads HTML without JavaScript, so it also proves every link works before hydration.
 */
const MAX_PAGES = 400
const SKIP = [/^\/api\//, /^\/_next\//, /^\/orders\/SD/, /^\/account\/reset-password/]

test("every linked page answers and has one h1", async ({ request, baseURL }) => {
  test.setTimeout(600_000)
  const origin = new URL(baseURL!).origin
  const sitemap = await (await request.get("/sitemap.xml")).text()
  const queue = ["/", ...[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname)]
  const seen = new Set<string>()
  const problems: string[] = []
  let links = 0

  while (queue.length > 0 && seen.size < MAX_PAGES) {
    const path = queue.shift()!
    if (seen.has(path) || SKIP.some((pattern) => pattern.test(path))) continue
    seen.add(path)

    const response = await request.get(path, { maxRedirects: 5 })
    const finalPath = new URL(response.url()).pathname
    if (response.status() >= 400) {
      problems.push(`${path} → ${response.status()}`)
      continue
    }
    if (!(response.headers()["content-type"] ?? "").includes("text/html")) continue
    const html = await response.text()

    const h1s = html.match(/<h1[\s>]/g)?.length ?? 0
    if (h1s !== 1) problems.push(`${path} (${finalPath}) has ${h1s} h1 elements`)

    for (const match of html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)) {
      links++
      const href = match[1].replaceAll("&amp;", "&")
      if (href === "" || href === "#" || href.startsWith("javascript:")) {
        problems.push(`${path} links to a placeholder href "${href}"`)
        continue
      }
      const url = new URL(href, origin)
      if (url.origin !== origin) continue
      const next = url.pathname + url.search
      if (!seen.has(next)) queue.push(next)
    }
  }

  test.info().annotations.push({ type: "crawl", description: `${seen.size} pages, ${links} links` })
  expect(problems).toEqual([])
  expect(seen.size).toBeGreaterThan(20)
})
