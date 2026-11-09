"use client"

import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/** Enable browser-only actions after React has attached their handlers. */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false)
}
