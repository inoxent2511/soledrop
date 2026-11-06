"use client"

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react"

import { cn } from "@/lib/utils"

/** Admin form controls: the storefront's control styling at the admin's denser size (admin-design.md). */
export const adminControl =
  "h-11 w-full rounded-md border-2 border-control-border bg-background px-3 text-16 transition-colors hover:border-foreground focus-visible:border-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive disabled:opacity-60"

type Shared = { name: string; label: string; error?: string; hint?: ReactNode; formId: string }

function describedBy(id: string, hint: ReactNode, error?: string) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined
}

function Frame({ id, label, hint, error, children }: { id: string; label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-14 font-bold">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-14 text-subtle-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-14 font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function AdminField({ name, label, error, hint, formId, className, ...input }: Shared & InputHTMLAttributes<HTMLInputElement>) {
  const id = `${formId}-${name}`
  return (
    <Frame id={id} label={label} hint={hint} error={error}>
      <input id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={cn(adminControl, className)} {...input} />
    </Frame>
  )
}

export function AdminTextarea({ name, label, error, hint, formId, className, ...input }: Shared & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = `${formId}-${name}`
  return (
    <Frame id={id} label={label} hint={hint} error={error}>
      <textarea id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={cn(adminControl, "h-auto min-h-24 py-2", className)} {...input} />
    </Frame>
  )
}

export function AdminSelect({ name, label, error, hint, formId, className, children, ...input }: Shared & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = `${formId}-${name}`
  return (
    <Frame id={id} label={label} hint={hint} error={error}>
      <select id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={cn(adminControl, className)} {...input}>
        {children}
      </select>
    </Frame>
  )
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-14 font-medium text-destructive empty:hidden">
      {children}
    </p>
  )
}
