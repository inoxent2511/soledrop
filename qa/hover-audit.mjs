// Hover audit: on every audited route, in light and dark, hovers each visible link, button, tab and
// checkbox label at 1440 (also inside the header panels, the bag and the condition dialog) and compares what the browser paints before and after. It flags hover
// states whose text falls below WCAG contrast against the colour behind it, and hovers whose fill
// nearly disappears into its surroundings. Usage: node qa/hover-audit.mjs [baseURL] → qa/out/hover-audit.json
import { writeFileSync } from "node:fs"

import { chromium } from "@playwright/test"

const base = process.argv[2] ?? "http://localhost:3200"
const routes = [
  "/", "/new-arrivals", "/collections/new-arrivals", "/sale", "/pre-loved", "/products/asics-gel-kayano-30-black-silver",
  "/products/hoka-bondi-7-grey", "/contact", "/faq", "/size-guide", "/condition-guide", "/cart", "/search?q=nike", "/search?q=zzzzqx",
  "/account/login", "/account/register", "/account/forgot-password", "/orders/lookup", "/pages/shipping", "/pages/about", "/does-not-exist",
]

/** Runs in the page: paints of one element (text colour, its own fill and the colour behind it). */
function paint(index) {
  const parse = (value) => {
    const match = value.match(/rgba?\(([^)]+)\)/)
    if (!match) return null
    const [r, g, b, a = 1] = match[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    return { r, g, b, a }
  }
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })
  /** The colour behind `node`: its ancestors' fills composited from the root up. */
  const behind = (node) => {
    const layers = []
    let image = false
    for (let current = node; current; current = current.parentElement) {
      const style = getComputedStyle(current)
      if (style.backgroundImage !== "none" && current !== node) image = true
      const fill = parse(style.backgroundColor)
      if (fill && fill.a > 0) layers.push(fill)
    }
    let colour = { r: 255, g: 255, b: 255, a: 1 }
    for (const layer of layers.reverse()) colour = over(layer, colour)
    return { colour, image }
  }
  const element = window.__hoverTargets[index]
  const style = getComputedStyle(element)
  const own = parse(style.backgroundColor)
  const outside = behind(element.parentElement ?? element)
  const fill = own && own.a > 0 ? over(own, outside.colour) : outside.colour
  const text = parse(style.color)
  const textElement = [...element.querySelectorAll("*")].find((child) => child.childNodes.length && [...child.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) ?? element
  const textStyle = getComputedStyle(textElement)
  const textColour = parse(textStyle.color) ?? text
  const textBehind = behind(textElement).colour
  return {
    text: over(textColour, textBehind),
    behindText: textBehind,
    fill,
    outside: outside.colour,
    image: outside.image,
    size: parseFloat(textStyle.fontSize),
    weight: Number(textStyle.fontWeight),
    opacity: Number(style.opacity),
  }
}

const luminance = ({ r, g, b }) => {
  const channel = (value) => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const hex = ({ r, g, b }) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")

/** Panels opened on top of a page; their controls are audited on their own (`scope` limits the targets). */
const panels = [
  { name: "nav dropdown", route: "/", scope: "[id^=nav-panel-]:not([hidden])", open: (page) => page.locator("header").getByRole("button", { name: "Men", exact: true }).hover() },
  { name: "account popover", route: "/", scope: "[role=dialog]", open: (page) => page.locator("header").getByRole("button", { name: /^Account/ }).click() },
  { name: "search overlay", route: "/", scope: "[role=dialog]", open: async (page) => {
    await page.locator("header").getByRole("button", { name: "Search" }).click()
    await page.getByRole("combobox").fill("nike")
    await page.getByRole("option").first().waitFor()
  } },
  { name: "empty mini-cart", route: "/", scope: "[role=dialog]", open: (page) => page.locator("header").getByRole("button", { name: /^Bag/ }).click() },
  { name: "mini-cart with a pair", route: "/products/nike-air-max", scope: "[role=dialog]", open: async (page) => {
    const size = page.getByRole("radio", { name: /42/ }).first()
    await size.focus()
    await page.keyboard.press("Space")
    await page.getByRole("button", { name: "Add to cart", exact: true }).click()
    await page.locator("header").getByRole("button", { name: "Bag, 1 item" }).waitFor()
    await page.locator("header").getByRole("button", { name: /^Bag/ }).click()
  } },
  { name: "condition dialog", route: "/products/hoka-bondi-7-grey", scope: "dialog[open]", open: (page) => page.getByRole("button", { name: /what condition grades mean/ }).click() },
]

const browser = await chromium.launch()
const findings = []
let checked = 0
for (const theme of ["light", "dark"]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": `198.51.100.9, hover-${theme}` } })
  const page = await context.newPage()
  for (const target of [...routes.map((route) => ({ route, name: route, scope: "body" })), ...panels]) {
    const route = target.name
    await page.goto(base + target.route, { waitUntil: "load" })
    await page.waitForFunction(() => Object.keys(document.querySelector("header") ?? {}).some((key) => key.startsWith("__reactFiber")))
    if (target.open) {
      await target.open(page)
      await page.locator(target.scope).first().waitFor()
      await page.waitForTimeout(300)
    }
    const count = await page.evaluate((scope) => {
      const nodes = [...document.querySelectorAll(scope)].flatMap((root) => [...root.querySelectorAll("a[href], button, [role=tab], [role=option], label:has(input[type=checkbox]), summary")])
      window.__hoverTargets = nodes.filter((node) => {
        const box = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        return box.width > 4 && box.height > 4 && style.visibility !== "hidden" && !node.closest("[hidden], [inert], .sr-only")
      })
      return window.__hoverTargets.length
    }, target.scope)
    for (let index = 0; index < count; index++) {
      const handle = await page.evaluateHandle((i) => window.__hoverTargets[i], index)
      const element = handle.asElement()
      if (!element) continue
      await element.scrollIntoViewIfNeeded().catch(() => {})
      const box = await element.boundingBox()
      if (!box) continue
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      const hit = await page.evaluate(([i, px, py]) => window.__hoverTargets[i].contains(document.elementFromPoint(px, py)), [index, x, y])
      if (!hit) continue
      // Panels close when the pointer leaves them, so their "before" is read with the pointer parked inside the scope.
      const park = target.open ? await page.locator(target.scope).first().boundingBox() : null
      await page.mouse.move(park ? park.x + 2 : 1439, park ? park.y + 2 : 899)
      await page.waitForTimeout(30)
      const before = await page.evaluate(paint, index)
      await page.mouse.move(x, y)
      await page.waitForTimeout(60)
      const after = await page.evaluate(paint, index)
      checked++
      const label = await page.evaluate((i) => {
        const node = window.__hoverTargets[i]
        return (node.getAttribute("aria-label") || node.textContent || node.tagName).trim().replace(/\s+/g, " ").slice(0, 60)
      }, index)
      const large = after.size >= 24 || (after.size >= 18.66 && after.weight >= 700)
      const need = large ? 3 : 4.5
      const ratioAfter = contrast(after.text, after.behindText)
      const ratioBefore = contrast(before.text, before.behindText)
      const fillChanged = hex(before.fill) !== hex(after.fill)
      const fillVsOutside = contrast(after.fill, after.outside)
      const problems = []
      if (!after.image && ratioAfter < need && ratioAfter < ratioBefore - 0.01) problems.push(`hover text ${ratioAfter.toFixed(2)}:1 (was ${ratioBefore.toFixed(2)}:1, needs ${need})`)
      if (!after.image && fillChanged && fillVsOutside < 1.05 && contrast(before.fill, before.outside) >= 1.05) problems.push("hover fill vanishes into the background")
      if (after.opacity < 0.6 && after.opacity < before.opacity) problems.push(`hover opacity ${before.opacity} → ${after.opacity}`)
      if (problems.length) {
        findings.push({ theme, route, label, problems, before: { text: hex(before.text), fill: hex(before.fill) }, after: { text: hex(after.text), fill: hex(after.fill), behind: hex(after.behindText) } })
      }
      await handle.dispose()
    }
  }
  await context.close()
}
await browser.close()

writeFileSync("qa/out/hover-audit.json", JSON.stringify({ checked, findings }, null, 2))
console.log(`hover audit: ${checked} hovers checked, ${findings.length} findings`)
for (const finding of findings) console.log(`${finding.theme} ${finding.route} [${finding.label}] ${finding.problems.join("; ")} ${JSON.stringify(finding.after)}`)
