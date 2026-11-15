"use client"

import { useSyncExternalStore } from "react"

export type CartDrawerRequest = { id: number; pathname: string }

const initialRequest: CartDrawerRequest = { id: 0, pathname: "" }
let currentRequest = initialRequest
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const notify = () => listeners.forEach((listener) => listener())
const snapshot = () => currentRequest

/** Keep an add-to-bag request until the deferred header drawer has loaded. */
export function requestCartDrawer() {
  if (typeof window === "undefined") return
  currentRequest = { id: currentRequest.id + 1, pathname: window.location.pathname }
  notify()
}

/** A request belongs to the page where the shopper added the item. */
export function clearCartDrawerRequestOutside(pathname: string) {
  if (!currentRequest.pathname || currentRequest.pathname === pathname) return
  currentRequest = { ...currentRequest, pathname: "" }
  notify()
}

export function useCartDrawerRequest() {
  return useSyncExternalStore(subscribe, snapshot, () => initialRequest)
}
