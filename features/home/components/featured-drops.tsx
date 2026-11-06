"use client"

import Image from "next/image"
import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react"

import { Container } from "@/components/shared/container"
import { KIND_BADGE } from "@/features/home/components/featured-buy-box"
import { cn } from "@/lib/utils"
import type { ProductKind } from "@/server/catalog/types"

export type FeaturedSlide = {
  kind: ProductKind
  image: { url: string; alt: string } | null
  content: ReactNode
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"
const noop = () => () => {}
const subscribeMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange)
  return () => document.removeEventListener("visibilitychange", onChange)
}

const slideId = (kind: ProductKind) => `featured-drop-${kind}`
/** The strip under each photo that the controls sit in; slides reserve the same height so nothing overlaps. */
const CONTROLS_STRIP = "h-14 md:h-16"

/** A plain click (no new-tab modifier) that the slider handles instead of following the link. */
const isPlainClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey

/**
 * Featured Drop (D-061, D-062): Brand New then Pre-Loved, changing on a short timer. The controls
 * sit under the photo, not on it: two tabs whose bars fill while their drop shows (6 s); there is
 * no Pause button (the owner's call, D-062). Pointer or focus inside the section holds the timer, as
 * does a hidden tab; picking a tab, swiping, or touching a buy box stops it for good, because a
 * shopper filling in a buy box must not have it move away. Reduced motion never autoplays. Without
 * JavaScript the tabs are links that jump to each drop and the track scrolls.
 */
export function FeaturedDrops({ slides }: { slides: FeaturedSlide[] }) {
  const baseId = useId()
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false
  )
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true
  )
  const pageHidden = useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false
  )
  const [active, setActive] = useState(0)
  const [stopped, setStopped] = useState(false)
  const [held, setHeld] = useState(false)
  const track = useRef<HTMLDivElement>(null)
  const tabs = useRef<(HTMLAnchorElement | null)[]>([])

  const many = slides.length > 1
  const autoplay = hydrated && many && !reducedMotion && !stopped
  const running = autoplay && !held && !pageHidden

  const goTo = (index: number) => {
    const node = track.current
    if (!node) return
    const next = (index + slides.length) % slides.length
    const direction = getComputedStyle(node).direction === "rtl" ? -1 : 1
    const smooth = !window.matchMedia(REDUCED_MOTION).matches
    node.scrollTo({
      left: next * node.clientWidth * direction,
      behavior: smooth ? "smooth" : "instant",
    })
    setActive(next)
  }

  /** A shopper's own choice: show that drop and stop the timer. */
  const choose = (index: number, focus = false) => {
    setStopped(true)
    goTo(index)
    if (focus) tabs.current[(index + slides.length) % slides.length]?.focus()
  }

  const onScroll = () => {
    const node = track.current
    if (!node) return
    const index = Math.round(Math.abs(node.scrollLeft) / node.clientWidth)
    if (index !== active && index < slides.length) setActive(index)
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl"
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[
      event.key as "ArrowRight" | "ArrowLeft"
    ]
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? slides.length - 1
          : step === undefined
            ? null
            : active + step
    if (next === null) return
    event.preventDefault()
    choose(next, true)
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured drops"
      className="relative bg-foreground py-12 text-background md:py-17.5"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setHeld(false)
      }}
    >
      {many ? (
        // Laid over the section: an empty copy of the photo box, then the controls in the strip under it.
        <Container className="pointer-events-none absolute inset-x-0 top-12 z-10 md:top-17.5">
          <div className="flex w-full flex-col lg:w-1/2 3xl:w-180">
            <div className="aspect-square w-full" />
            <div
              className={cn(
                "pointer-events-auto flex items-end gap-3 md:gap-4",
                CONTROLS_STRIP
              )}
            >
              <div
                role="tablist"
                aria-label="Featured drops"
                className="grid min-w-0 flex-1 grid-cols-2 gap-3 md:gap-4"
              >
                {slides.map((slide, index) => {
                  const selected = index === active
                  const badge = KIND_BADGE[slide.kind]
                  return (
                    <a
                      key={slide.kind}
                      ref={(node) => {
                        tabs.current[index] = node
                      }}
                      id={`${baseId}-tab-${slide.kind}`}
                      href={`#${slideId(slide.kind)}`}
                      role="tab"
                      aria-selected={selected}
                      aria-controls={slideId(slide.kind)}
                      tabIndex={selected ? 0 : -1}
                      onClick={(event) => {
                        if (!isPlainClick(event)) return
                        event.preventDefault()
                        choose(index)
                      }}
                      onKeyDown={onTabKeyDown}
                      className="group flex min-h-11 min-w-0 flex-col justify-end gap-2.5"
                    >
                      <span
                        className={cn(
                          "flex items-center gap-2 text-14 font-bold uppercase transition-colors md:text-16",
                          selected
                            ? "text-background"
                            : "text-muted-foreground group-hover:text-background"
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "font-display",
                            selected ? "text-brand" : ""
                          )}
                        >
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate">{badge.label}</span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="block h-1 overflow-hidden rounded-full bg-well-dark"
                      >
                        {selected ? (
                          autoplay ? (
                            // Keyed by the drop so the bar restarts each time it comes round; its end shows the next drop.
                            <span
                              key={`${slide.kind}-${active}`}
                              onAnimationEnd={() => goTo(index + 1)}
                              className={cn(
                                "block h-full",
                                badge.className,
                                "animate-drop-progress",
                                !running && "animation-paused"
                              )}
                            />
                          ) : (
                            <span
                              className={cn("block h-full", badge.className)}
                            />
                          )
                        ) : null}
                      </span>
                    </a>
                  )
                })}
              </div>
            </div>
          </div>
        </Container>
      ) : null}

      <div
        ref={track}
        onScroll={onScroll}
        // A swipe or any use of a buy box is the shopper taking over: the timer stops for good.
        onPointerDown={() => setStopped(true)}
        onKeyDown={() => setStopped(true)}
        aria-live={running ? "off" : "polite"}
        className="relative flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-x-contain"
      >
        {slides.map((slide, index) => (
          <div
            key={slide.kind}
            id={slideId(slide.kind)}
            role={many ? "tabpanel" : "group"}
            aria-roledescription="slide"
            aria-labelledby={many ? `${baseId}-tab-${slide.kind}` : undefined}
            aria-label={
              many ? undefined : `${KIND_BADGE[slide.kind].label} featured drop`
            }
            inert={hydrated && index !== active}
            className="w-full shrink-0 snap-start"
          >
            <Container className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-16 3xl:gap-22.5">
              <div className="flex w-full shrink-0 flex-col lg:w-1/2 3xl:w-180">
                <div className="relative aspect-square w-full overflow-hidden rounded-4xl bg-well-dark">
                  {slide.image ? (
                    <Image
                      src={slide.image.url}
                      alt={slide.image.alt}
                      fill
                      sizes="(min-width: 1920px) 720px, (min-width: 1024px) 45vw, 100vw"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                {many ? (
                  <div aria-hidden="true" className={CONTROLS_STRIP} />
                ) : null}
              </div>
              {slide.content}
            </Container>
          </div>
        ))}
      </div>
    </section>
  )
}
