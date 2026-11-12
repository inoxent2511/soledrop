"use client"

import Image from "next/image"
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"

import { cn } from "@/lib/utils"

type GalleryImage = { url: string; alt: string }

export function ProductGallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const [hovering, setHovering] = useState(false)
  const mainButton = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const galleryThumbs = useRef<(HTMLButtonElement | null)[]>([])
  const viewerThumbs = useRef<(HTMLButtonElement | null)[]>([])
  const previousActive = useRef(active)
  const touchStart = useRef<number | null>(null)
  const current = images[active] ?? images[0]

  const move = useCallback((direction: number) => setActive((index) => (index + direction + images.length) % images.length), [images.length])

  useEffect(() => {
    if (active === previousActive.current) return
    previousActive.current = active
    galleryThumbs.current[active]?.scrollIntoView({ block: "nearest", inline: "nearest" })
    viewerThumbs.current[active]?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [active])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const returnFocus = mainButton.current
    document.body.style.overflow = "hidden"
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false) }
      if (images.length > 1 && event.key === "ArrowLeft") { event.preventDefault(); move(-1) }
      if (images.length > 1 && event.key === "ArrowRight") { event.preventDefault(); move(1) }
      if (event.key !== "Tab") return
      const controls = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])")
      if (!controls?.length) return
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
      returnFocus?.focus()
    }
  }, [open, images.length, move])

  const trackPointer = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "mouse") return
    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty("--zoom-x", `${(event.clientX - bounds.left) / bounds.width * 100}%`)
    event.currentTarget.style.setProperty("--zoom-y", `${(event.clientY - bounds.top) / bounds.height * 100}%`)
  }

  if (!current) return <div className="aspect-square rounded-3xl bg-well" aria-label="No product photos available" />

  return <div className="flex min-w-0 flex-col gap-4 md:gap-5">
    <div className="overflow-hidden rounded-3xl bg-well">
      <button
        ref={mainButton}
        type="button"
        aria-label={`Enlarge photo ${active + 1} of ${images.length} of ${title}`}
        onClick={() => setOpen(true)}
        onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovering(true) }}
        onPointerMove={trackPointer}
        onPointerLeave={() => setHovering(false)}
        className="group relative block aspect-square w-full cursor-zoom-in overflow-hidden focus-visible:outline-3 focus-visible:outline-offset-[-4px] focus-visible:outline-brand"
      >
        <Image
          src={current.url}
          alt={current.alt || title}
          fill
          priority
          sizes="(min-width: 1920px) 820px, (min-width: 1024px) 45vw, 100vw"
          className="object-cover transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transformOrigin: "var(--zoom-x, 50%) var(--zoom-y, 50%)", transform: hovering ? "scale(1.65)" : undefined }}
        />
        <span className="absolute end-4 top-4 grid size-11 place-items-center rounded-full bg-background/95 text-foreground shadow-md transition-transform group-hover:scale-105" aria-hidden="true"><ZoomIn className="size-5" /></span>
        <span className="sr-only">Click to open full-screen image viewer</span>
      </button>
      {images.length > 1 ? <div className="flex justify-end bg-background px-3 py-2">
        <div className="inline-flex items-center rounded-full border border-border bg-background p-0.5 shadow-sm">
          <button type="button" onClick={() => { setHovering(false); move(-1) }} aria-label="Previous product photo" className="grid size-9 place-items-center rounded-full text-foreground transition-colors hover:bg-brand focus-visible:outline-3 focus-visible:outline-brand"><ChevronLeft className="size-4" /></button>
          <span className="min-w-12 text-center text-14 font-semibold text-foreground tabular-nums" aria-live="polite">{active + 1} / {images.length}</span>
          <button type="button" onClick={() => { setHovering(false); move(1) }} aria-label="Next product photo" className="grid size-9 place-items-center rounded-full text-foreground transition-colors hover:bg-brand focus-visible:outline-3 focus-visible:outline-brand"><ChevronRight className="size-4" /></button>
        </div>
      </div> : null}
    </div>

    {images.length > 1 ? <div role="group" aria-label={`${title} photos`} className="flex snap-x gap-2 overflow-x-auto pb-2 md:gap-3">
      {images.map((image, index) => <button
        ref={(node) => { galleryThumbs.current[index] = node }}
        key={`${image.url}-${index}`}
        type="button"
        aria-label={`Show photo ${index + 1} of ${images.length}`}
        aria-current={index === active ? "true" : undefined}
        onClick={() => { setHovering(false); setActive(index) }}
        className={cn("relative aspect-square w-18 shrink-0 snap-start overflow-hidden rounded-lg border-2 bg-well transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand md:w-24", index === active ? "border-brand" : "border-border hover:border-foreground")}
      ><Image src={image.url} alt="" fill sizes="96px" className="object-cover" /></button>)}
    </div> : null}

    {open ? <div ref={dialog} role="dialog" aria-modal="true" aria-label={`${title} image viewer`} className="fixed inset-0 z-[100] flex flex-col bg-foreground text-background">
      <div className="flex items-center justify-between gap-4 border-b border-white/15 px-4 py-3 md:px-8">
        <div className="min-w-0"><p className="truncate text-16 font-bold md:text-20">{title}</p><p className="text-14 text-white/65" aria-live="polite">Photo {active + 1} of {images.length}</p></div>
        <button ref={closeButton} type="button" onClick={() => setOpen(false)} aria-label="Close image viewer" className="grid size-11 shrink-0 place-items-center rounded-full border border-white/30 transition-colors hover:bg-brand hover:text-brand-foreground focus-visible:outline-3 focus-visible:outline-brand"><X className="size-6" /></button>
      </div>
      <div className="relative min-h-0 flex-1" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStart.current !== null && end !== undefined && Math.abs(end - touchStart.current) > 45 && images.length > 1) move(end < touchStart.current ? 1 : -1); touchStart.current = null }}>
        <Image src={current.url} alt={current.alt || title} fill sizes="100vw" className="object-contain px-4 py-5 md:px-20 md:py-6" />
        {images.length > 1 ? <>
          <button type="button" onClick={() => move(-1)} aria-label="Previous product photo" className="absolute start-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-background text-foreground shadow-md transition-colors hover:bg-brand focus-visible:outline-3 focus-visible:outline-brand md:start-8 md:size-13"><ChevronLeft className="size-6" /></button>
          <button type="button" onClick={() => move(1)} aria-label="Next product photo" className="absolute end-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-background text-foreground shadow-md transition-colors hover:bg-brand focus-visible:outline-3 focus-visible:outline-brand md:end-8 md:size-13"><ChevronRight className="size-6" /></button>
        </> : null}
      </div>
      {images.length > 1 ? <div role="group" aria-label="Choose a photo" className="flex justify-center gap-2 overflow-x-auto border-t border-white/15 px-4 py-3 md:gap-3">
        {images.map((image, index) => <button
          ref={(node) => { viewerThumbs.current[index] = node }}
          key={`${image.url}-${index}`}
          type="button"
          aria-label={`Show photo ${index + 1} of ${images.length} in viewer`}
          aria-current={index === active ? "true" : undefined}
          onClick={() => setActive(index)}
          className={cn("relative aspect-square w-14 shrink-0 overflow-hidden rounded-md border-2 bg-well focus-visible:outline-3 focus-visible:outline-brand md:w-18", index === active ? "border-brand" : "border-white/30 hover:border-white")}
        ><Image src={image.url} alt="" fill sizes="72px" className="object-cover" /></button>)}
      </div> : null}
    </div> : null}
  </div>
}
