import type { Page } from "@playwright/test"

export type LayoutViolation = { kind: string; selector: string; detail: string }

/**
 * Runs in the page: horizontal page scroll, boxes outside the viewport, children spilling out of
 * their parent, clipped text and fixed panels cut off by the viewport. Content inside an
 * intentional scroll or clip container (overflow other than visible) is judged against that
 * container, not the viewport; screen-reader-only text and invisible boxes are ignored.
 */
function auditInPage(): LayoutViolation[] {
  const out: LayoutViolation[] = []
  const width = window.innerWidth
  const height = window.innerHeight
  const EPSILON = 0.5

  const describe = (element: Element) => {
    const id = element.id ? `#${element.id}` : ""
    const label = element.getAttribute("aria-label") ?? element.getAttribute("data-slot") ?? ""
    const text = (element.textContent ?? "").trim().slice(0, 30)
    const parent = element.parentElement
    const where = parent ? `${parent.tagName.toLowerCase()}${parent.id ? `#${parent.id}` : ""} > ` : ""
    return `${where}${element.tagName.toLowerCase()}${id}${label ? `[${label}]` : ""} "${text}"`
  }

  const visible = (element: Element, style: CSSStyleDeclaration) => {
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false
    if (element.closest(".sr-only, [hidden], [inert], [aria-hidden=true] svg")) return false
    return true
  }

  const clips = (style: CSSStyleDeclaration) => style.overflowX !== "visible"

  /** The nearest ancestor that scrolls or clips horizontally, or null for the viewport. */
  const clipAncestor = (element: Element) => {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      if (clips(getComputedStyle(node))) return node
    }
    return null
  }

  if (document.documentElement.scrollWidth > width + EPSILON) {
    out.push({ kind: "page-scroll-x", selector: "html", detail: `scrollWidth ${document.documentElement.scrollWidth} > ${width}` })
  }

  for (const element of document.body.querySelectorAll("*")) {
    const style = getComputedStyle(element)
    if (!visible(element, style)) continue
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue

    const container = clipAncestor(element)
    if (!container && (rect.right > width + EPSILON || rect.left < -EPSILON)) {
      out.push({ kind: "outside-viewport", selector: describe(element), detail: `x ${rect.left.toFixed(1)}–${rect.right.toFixed(1)} in ${width}` })
    }

    if (style.position === "fixed" && !clips(style) && (rect.bottom > height + EPSILON || rect.top < -EPSILON) && style.overflowY === "visible") {
      out.push({ kind: "fixed-cut-off", selector: describe(element), detail: `y ${rect.top.toFixed(1)}–${rect.bottom.toFixed(1)} in ${height}` })
    }

    const parent = element.parentElement
    if (parent && parent !== document.body && style.position !== "absolute" && style.position !== "fixed") {
      const parentStyle = getComputedStyle(parent)
      if (!clips(parentStyle) && parentStyle.display !== "contents") {
        const box = parent.getBoundingClientRect()
        const inner = { left: box.left + parseFloat(parentStyle.borderInlineStartWidth), right: box.right - parseFloat(parentStyle.borderInlineEndWidth) }
        if (rect.right > inner.right + 1 || rect.left < inner.left - 1) {
          out.push({ kind: "spills-parent", selector: describe(element), detail: `child ${rect.left.toFixed(1)}–${rect.right.toFixed(1)} parent ${inner.left.toFixed(1)}–${inner.right.toFixed(1)}` })
        }
      }
    }

    const ownText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
    if (ownText && clips(style) && style.textOverflow !== "ellipsis" && style.overflowX !== "auto" && style.overflowX !== "scroll" && element.scrollWidth > element.clientWidth + 1) {
      out.push({ kind: "text-clipped", selector: describe(element), detail: `scrollWidth ${element.scrollWidth} > clientWidth ${element.clientWidth}` })
    }
  }
  return out
}

export async function auditLayout(page: Page): Promise<LayoutViolation[]> {
  return page.evaluate(auditInPage)
}

/** Every page the storefront serves, with the states a shopper can reach without signing in. */
export const AUDIT_ROUTES = [
  "/",
  "/new-arrivals",
  "/collections/new-arrivals",
  "/collections/men",
  "/collections/women",
  "/sale",
  "/collections/brand-new",
  "/pre-loved",
  "/products/asics-gel-kayano-30-black-silver",
  "/products/hoka-bondi-7-grey",
  "/contact",
  "/faq",
  "/size-guide",
  "/condition-guide",
  "/terms",
  "/privacy",
  "/returns",
  "/cart",
  "/search?q=nike",
  "/search?q=zzzzqx",
  "/search",
  "/account/login",
  "/account/register",
  "/account/forgot-password",
  "/orders/lookup",
  "/shipping",
  "/pages/about",
  "/does-not-exist",
]

/** 200 % zoom on a 1280 px window is a 640 px CSS viewport at device scale 2. */
export const AUDIT_WIDTHS = [320, 360, 390, 640, 768, 1024, 1280, 1440, 1920]
