"use client"

import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon } from "lucide-react"
import type { ComponentProps } from "react"

import { ChevronDownIcon } from "@/components/icons"
import { cn } from "@/lib/utils"
import { selectTriggerClasses } from "./select-classes"

/**
 * The site's dropdown (D-064), on Base UI's Select: a combobox trigger and a listbox the site can
 * style, unlike a native select whose open list is the operating system's. White list; the
 * highlighted option is lime; the chosen one is bold with a check.
 */
const Select = SelectPrimitive.Root

function SelectLabel({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={className}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        selectTriggerClasses,
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon data-slot="select-icon" className="flex shrink-0">
        <ChevronDownIcon
          aria-hidden="true"
          className="h-auto w-4 transition-transform duration-200 group-data-[popup-open]:rotate-180 md:w-4.5"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectValue({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Value>) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("min-w-0 truncate", className)}
      {...props}
    />
  )
}

/** The open list, under the trigger and as wide as it. */
function SelectContent({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Popup>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        data-slot="select-positioner"
        alignItemWithTrigger={false}
        sideOffset={8}
        className="z-overlay outline-none"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "flex max-h-[var(--available-height)] w-[var(--anchor-width)] flex-col overflow-y-auto rounded-lg border-2 border-foreground bg-background py-1.5 text-foreground shadow-card-lift outline-none data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-1 data-[starting-style]:opacity-0 motion-safe:transition-[opacity,transform] motion-safe:duration-150",
            className
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 text-16 font-medium outline-none select-none hover:bg-brand hover:text-brand-foreground data-[highlighted]:bg-brand data-[highlighted]:text-brand-foreground data-[selected]:font-bold md:px-5 md:text-18",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="flex shrink-0">
        <CheckIcon aria-hidden="true" className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
}
