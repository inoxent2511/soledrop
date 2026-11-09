"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react"

/** Keep the painted trigger while optional panels load on intent or after the document. */
export function DeferredControl<Props extends object>({ load, props, fallback, media, hoverOnUpgrade = false, openKeys }: { load: () => Promise<ComponentType<Props>>; props: Props; fallback: ReactNode; media?: string; hoverOnUpgrade?: boolean; openKeys?: readonly string[] }) {
  const [Component, setComponent] = useState<ComponentType<Props> | null>(null)
  const root = useRef<HTMLSpanElement>(null), pending = useRef<Promise<void> | null>(null), mounted = useRef(false), restoreFocus = useRef(false), requestedOpen = useRef(false)
  const pointer = useRef<{ x: number; y: number; type: string } | null>(null)
  const requestedKey = useRef<string | null>(null)
  const prepared = useRef<ComponentType<Props> | null>(null), pointerDown = useRef(false)
  const publish = useCallback(() => {
    const loaded = prepared.current
    if (!loaded || !mounted.current || pointerDown.current) return
    restoreFocus.current = root.current?.contains(document.activeElement) ?? false
    setComponent(() => loaded)
  }, [])
  const start = useCallback(() => {
    if (Component) return Promise.resolve()
    if (pending.current) return pending.current
    pending.current = load().then((loaded) => {
      prepared.current = loaded
      publish()
    }).catch(() => {
      pending.current = null
      if (requestedOpen.current) {
        requestedOpen.current = false
        const anchor = root.current?.querySelector<HTMLAnchorElement>("a[href]")
        if (anchor) window.location.assign(anchor.href)
      }
    })
    return pending.current
  }, [Component, load, publish])

  useEffect(() => {
    mounted.current = true
    let cancel = () => {}
    const matching = media ? window.matchMedia(media) : null
    const schedule = () => {
      if (Component || matching && !matching.matches) return
      cancel()
      if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(() => { void start() }, { timeout: 1000 })
        cancel = () => window.cancelIdleCallback(id)
      } else {
        const id = window.setTimeout(() => { void start() }, 0)
        cancel = () => window.clearTimeout(id)
      }
    }
    if (document.readyState === "complete") schedule()
    else window.addEventListener("load", schedule, { once: true })
    matching?.addEventListener("change", schedule)
    window.addEventListener("online", schedule)
    let releaseTimer: number | undefined
    const releasePointer = () => {
      if (!pointerDown.current) return
      // The browser sends click after pointerup. Keep its original target until that click.
      releaseTimer = window.setTimeout(() => { pointerDown.current = false; publish() }, 0)
    }
    window.addEventListener("pointerup", releasePointer)
    window.addEventListener("pointercancel", releasePointer)
    return () => { mounted.current = false; cancel(); window.clearTimeout(releaseTimer); window.removeEventListener("load", schedule); matching?.removeEventListener("change", schedule); window.removeEventListener("online", schedule); window.removeEventListener("pointerup", releasePointer); window.removeEventListener("pointercancel", releasePointer) }
  }, [Component, media, publish, start])

  useLayoutEffect(() => {
    if (Component && restoreFocus.current && !requestedOpen.current) {
      restoreFocus.current = false
      if (document.activeElement === document.body || root.current?.contains(document.activeElement)) root.current?.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true })
    }
  }, [Component])

  useEffect(() => {
    if (!Component || !requestedOpen.current) return
    const timer = window.setTimeout(() => {
      const trigger = root.current?.querySelector<HTMLElement>("a, button")
      const key = requestedKey.current
      requestedOpen.current = false
      restoreFocus.current = false
      requestedKey.current = null
      if (!trigger) return
      trigger.focus({ preventScroll: true })
      if (key) trigger.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
      else trigger.click()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [Component])

  useEffect(() => {
    if (!Component || !hoverOnUpgrade) return
    // Hover listeners attach in the panel's effects. Relay the stationary pointer afterwards;
    // loading code must not require the shopper to leave and re-enter the account trigger.
    const timer = window.setTimeout(() => {
      const point = pointer.current, trigger = root.current?.querySelector<HTMLElement>("a, button")
      if (point?.type !== "mouse" || !trigger || !trigger.contains(document.elementFromPoint(point.x, point.y))) return
      const position = { clientX: point.x, clientY: point.y, relatedTarget: document.body }
      trigger.dispatchEvent(new PointerEvent("pointerover", { ...position, bubbles: true, pointerType: "mouse" }))
      trigger.dispatchEvent(new MouseEvent("mouseenter", position))
      trigger.dispatchEvent(new MouseEvent("mousemove", { ...position, bubbles: true }))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [Component, hoverOnUpgrade])

  return <span ref={root} className="contents" onPointerEnter={(event) => { pointer.current = { x: event.clientX, y: event.clientY, type: event.pointerType }; void start() }} onPointerDownCapture={(event) => {
    if (!Component && event.button === 0) { pointerDown.current = true; void start() }
  }} onFocusCapture={() => { void start() }} onKeyDownCapture={(event) => {
    if (Component || !(openKeys ?? ["Enter", " "]).includes(event.key) || event.metaKey || event.ctrlKey || event.altKey) return
    event.preventDefault(); event.stopPropagation(); requestedOpen.current = true
    requestedKey.current = event.key.startsWith("Arrow") ? event.key : null
    pointerDown.current = false; publish(); void start()
  }} onClickCapture={(event) => {
    if (Component || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element) || !event.target.closest("a, button")) return
    event.preventDefault(); event.stopPropagation(); requestedOpen.current = true; requestedKey.current = null; pointerDown.current = false; publish(); void start()
  }}>{Component ? <Component {...props} /> : fallback}</span>
}
