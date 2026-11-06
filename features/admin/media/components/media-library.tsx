"use client"

import { Dialog } from "@base-ui/react/dialog"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ImagePlus, Trash2, Upload } from "lucide-react"
import { useId, useRef, useState, type DragEvent } from "react"

import { adminCatalogApi } from "@/api/admin/catalog"
import { ApiError } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { dialogBackdrop } from "@/components/admin/confirm-dialog"
import { adminControl, FormAlert } from "@/components/admin/form"
import { cn } from "@/lib/utils"
import type { MediaView } from "@/server/media/service"

const key = (q: string, page: number) => ["admin", "media", q, page] as const
const message = (failure: unknown) => (failure instanceof ApiError ? failure.message : "Something went wrong. Please try again.")

function useMedia(q: string, page: number) {
  return useQuery({ queryKey: key(q, page), queryFn: ({ signal }) => adminCatalogApi.media({ q, page }, signal) })
}

/** Drop zone + file button: uploads each image in turn and reports per-file errors. */
function Uploader({ onUploaded }: { onUploaded: (items: MediaView[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [over, setOver] = useState(false)

  async function send(files: File[]) {
    setBusy(true)
    setErrors([])
    const done: MediaView[] = []
    const failed: string[] = []
    for (const file of files) {
      try {
        done.push(await adminCatalogApi.upload(file))
      } catch (failure) {
        failed.push(`${file.name}: ${message(failure)}`)
      }
    }
    setErrors(failed)
    setBusy(false)
    if (done.length) onUploaded(done)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setOver(false)
    void send([...event.dataTransfer.files])
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn("flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-5 text-center", over ? "border-foreground bg-surface" : "border-border")}
    >
      <Upload aria-hidden className="size-6 text-subtle-foreground" />
      <p className="text-14 text-subtle-foreground">Drop photos here, or</p>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" aria-label="Choose photos to upload" onChange={(event) => void send([...(event.target.files ?? [])])} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={adminButton({ tone: "secondary", size: "sm" })}>
        <ImagePlus aria-hidden /> {busy ? "Uploading…" : "Choose photos"}
      </button>
      <p className="text-14 text-faint-foreground">JPEG, PNG, WebP or AVIF, up to 10 MB. Saved as WebP, at most 2400 px.</p>
      {errors.map((error) => (
        <FormAlert key={error}>{error}</FormAlert>
      ))}
    </div>
  )
}

function Grid({ items, selected, onSelect }: { items: MediaView[]; selected?: Set<string>; onSelect: (item: MediaView) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            aria-pressed={selected ? selected.has(item.url) : undefined}
            className={cn("flex w-full flex-col gap-1 rounded-md border-2 bg-background p-1.5 text-start transition-colors hover:border-foreground", selected?.has(item.url) ? "border-foreground" : "border-border")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- library thumbnails come straight from /media */}
            <img src={item.url} alt={item.alt || item.filename} width={item.width} height={item.height} loading="lazy" className="aspect-square w-full rounded-sm bg-surface object-contain" />
            <span className="truncate text-14">{item.filename}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** The Media page: upload, search, alt text and delete (refused while a product uses the image). */
export function MediaLibrary({ canWrite }: { canWrite: boolean }) {
  const id = useId()
  const client = useQueryClient()
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const media = useMedia(q, page)
  const [current, setCurrent] = useState<MediaView | null>(null)
  const [alt, setAlt] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = () => client.invalidateQueries({ queryKey: ["admin", "media"] })

  const open = (item: MediaView) => {
    setCurrent(item)
    setAlt(item.alt)
    setError(null)
  }

  async function act(work: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await work()
      await refresh()
      setCurrent(null)
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }

  const pages = Math.max(1, Math.ceil((media.data?.total ?? 0) / 40))

  return (
    <div className="flex flex-col gap-4">
      {canWrite ? <Uploader onUploaded={() => void refresh()} /> : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <label htmlFor={`${id}-q`} className="text-14 font-bold">
            Search photos
          </label>
          <input
            id={`${id}-q`}
            type="search"
            value={q}
            onChange={(event) => {
              setQ(event.target.value)
              setPage(1)
            }}
            className={adminControl}
          />
        </div>
        <p className="text-14 text-subtle-foreground">{media.data ? `${media.data.total} photos` : ""}</p>
      </div>
      {media.isPending ? <p className="text-16 text-subtle-foreground">Loading…</p> : null}
      {media.isError ? <FormAlert>{media.error.message}</FormAlert> : null}
      {media.data?.items.length === 0 ? <p className="text-16 text-subtle-foreground">No photos yet.</p> : null}
      {media.data ? <Grid items={media.data.items} onSelect={open} /> : null}
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={adminButton({ tone: "secondary", size: "sm" })}>
            Previous
          </button>
          <span className="text-14">
            Page {page} of {pages}
          </span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={adminButton({ tone: "secondary", size: "sm" })}>
            Next
          </button>
        </div>
      ) : null}

      <Dialog.Root open={current !== null} onOpenChange={(next) => !next && setCurrent(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop className={dialogBackdrop} />
          <Dialog.Popup className="fixed start-1/2 top-1/2 z-overlay flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg bg-background p-5 rtl:translate-x-1/2">
            {current ? (
              <>
                <Dialog.Title className="truncate text-20 font-extrabold">{current.filename}</Dialog.Title>
                {/* eslint-disable-next-line @next/next/no-img-element -- full-size preview of a library file */}
                <img src={current.url} alt={current.alt || current.filename} width={current.width} height={current.height} className="max-h-96 w-full rounded-md bg-surface object-contain" />
                <p className="text-14 text-subtle-foreground">
                  {current.width} × {current.height} px · {(current.bytes / 1024).toFixed(0)} KB · <code>{current.url}</code>
                </p>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${id}-alt`} className="text-14 font-bold">
                    Alt text
                  </label>
                  <input id={`${id}-alt`} value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={300} disabled={!canWrite} className={adminControl} />
                  <p className="text-14 text-subtle-foreground">Describe the photo for people using screen readers: “White leather sneaker, side view”.</p>
                </div>
                <FormAlert>{error}</FormAlert>
                <div className="flex flex-wrap justify-between gap-2">
                  {canWrite ? (
                    <button type="button" disabled={busy} onClick={() => void act(() => adminCatalogApi.deleteMedia(current.id))} className={adminButton({ tone: "ghost" })}>
                      <Trash2 aria-hidden /> Delete
                    </button>
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-2">
                    <Dialog.Close className={adminButton({ tone: "ghost" })}>Close</Dialog.Close>
                    {canWrite ? (
                      <button type="button" disabled={busy} onClick={() => void act(() => adminCatalogApi.setAlt(current.id, alt))} className={adminButton({ tone: "primary" })}>
                        Save
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

/** Choose photos from the library (and upload new ones) for a product. */
export function MediaPicker({ open, onOpenChange, chosen, onPick, canUpload }: { open: boolean; onOpenChange: (open: boolean) => void; chosen: string[]; onPick: (item: MediaView) => void; canUpload: boolean }) {
  const client = useQueryClient()
  const [q, setQ] = useState("")
  const media = useMedia(q, 1)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdrop} />
        <Dialog.Popup className="fixed start-1/2 top-1/2 z-overlay flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg bg-background p-5 rtl:translate-x-1/2">
          <Dialog.Title className="text-20 font-extrabold">Add photos</Dialog.Title>
          {canUpload ? (
            <Uploader
              onUploaded={(items) => {
                void client.invalidateQueries({ queryKey: ["admin", "media"] })
                for (const item of items) onPick(item)
              }}
            />
          ) : null}
          <input type="search" aria-label="Search photos" placeholder="Search photos" value={q} onChange={(event) => setQ(event.target.value)} className={adminControl} />
          {media.data ? <Grid items={media.data.items} selected={new Set(chosen)} onSelect={onPick} /> : <p className="text-16 text-subtle-foreground">Loading…</p>}
          <div className="flex justify-end">
            <Dialog.Close className={adminButton({ tone: "primary" })}>Done</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
