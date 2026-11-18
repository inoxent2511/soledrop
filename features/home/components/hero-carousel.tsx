"use client"

import Image from "next/image"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

export type HeroSlide = { src: string; alt: string; width?: number; height?: number }

const INTERVAL_MS = 6000

/**
 * The hero's photo panel. Slides advance every 6 s, pause while hovered or focused, and stay put
 * for shoppers who prefer reduced motion; the dots are real buttons (design: 18×18, active 36×18).
 */
export function HeroCarousel({ slides, initial = 0 }: { slides: HeroSlide[]; initial?: number }) {
  const [active, setActive] = useState(initial)
  const current = Math.min(active, Math.max(0, slides.length - 1))
  const [paused, setPaused] = useState(false)
  const firstSlide = slides[0]
  const aspectRatio = firstSlide?.width && firstSlide?.height && firstSlide.width >= firstSlide.height
    ? `${firstSlide.width} / ${firstSlide.height}`
    : "4 / 3"

  useEffect(() => {
    if (paused || slides.length < 2) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const timer = setInterval(() => setActive((index) => (index + 1) % slides.length), INTERVAL_MS)
    return () => clearInterval(timer)
  }, [paused, slides.length])

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured shoes"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="w-full bg-foreground"
    >
      <div className="relative w-full overflow-hidden" style={{ aspectRatio }}>
        {slides.map((slide, index) => {
          const ratio = slide.width && slide.height ? slide.width / slide.height : null
          return <div
            key={`${slide.src}-${index}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}`}
            aria-hidden={index !== current}
            className={cn("absolute inset-0 transition-opacity duration-700", index === current ? "opacity-100" : "opacity-0")}
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              priority={index === initial}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className={ratio !== null && ratio >= 1 ? "object-contain" : "object-cover object-center"}
            />
          </div>
        })}
      </div>
      {slides.length > 1 ? (
        <div className="flex h-10 items-center justify-center gap-3.5 bg-foreground">
          {slides.map((slide, index) => (
            <button
              key={`${slide.src}-${index}`}
              type="button"
              aria-label={`Show slide ${index + 1}`}
              aria-current={index === current}
              onClick={() => setActive(index)}
              className={cn(
                "relative h-4.5 rounded-full bg-background transition-[width,opacity] duration-300 after:absolute after:-inset-3",
                index === current ? "w-9" : "w-4.5 hover:bg-brand",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
