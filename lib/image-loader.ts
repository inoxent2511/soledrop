"use client"

import type { ImageLoaderProps } from "next/image"

import { IMAGE_WIDTHS as widths, IMAGE_VERSION } from "./image-variants.mjs"

/** Media variants are prepared on upload. Static UI assets are served directly. */
export default function imageLoader({ src, width }: ImageLoaderProps) {
  if (!/^\/media\/[0-9a-f-]{36}\.webp$/.test(src)) return src
  return src + "?w=" + (widths.find((value) => value >= width) ?? widths[widths.length - 1]) + "&v=" + IMAGE_VERSION
}
