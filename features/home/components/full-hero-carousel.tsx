"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"

import type { HomeImage } from "@/server/content/home-types"

const INTERVAL_MS = 6000

/** Finished banner artwork, including its words. The whole image stays visible at every width. */
export function FullHeroCarousel({ slides }: { slides: HomeImage[] }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const current = Math.min(active, Math.max(0, slides.length - 1))

  useEffect(() => {
    if (paused || slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const timer = setInterval(() => setActive((index) => (index + 1) % slides.length), INTERVAL_MS)
    return () => clearInterval(timer)
  }, [paused, slides.length])

  return <section aria-label="Homepage banners" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} className="bg-foreground">
    <h1 className="sr-only">Sole Drop</h1>
    {slides.map((slide, index) => <div key={`${slide.src}-${index}`} hidden={index !== current}>
      {slide.href ? <Link href={slide.href} aria-label={slide.alt || `Explore banner ${index + 1}`} className="block">
        <Image src={slide.src} alt={slide.alt} width={slide.width ?? 1920} height={slide.height ?? 720} priority={index === 0} sizes="100vw" className="block h-auto w-full" />
      </Link> : <Image src={slide.src} alt={slide.alt} width={slide.width ?? 1920} height={slide.height ?? 720} priority={index === 0} sizes="100vw" className="block h-auto w-full" />}
    </div>)}
    {slides.length > 1 ? <div className="flex justify-center gap-3 py-4" aria-label="Choose homepage banner">
      {slides.map((slide, index) => <button key={`${slide.src}-${index}`} type="button" onClick={() => setActive(index)} aria-label={`Show banner ${index + 1}`} aria-current={index === current} className={`h-3 rounded-full transition-all ${index === current ? "w-9 bg-brand" : "w-3 bg-background/60 hover:bg-background"}`} />)}
    </div> : null}
  </section>
}
