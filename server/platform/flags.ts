import "server-only"

import { serverEnv } from "@/lib/env.server"
import { currentStoreId } from "@/server/db/driver"
import { platform } from "@/server/platform"

/**
 * Feature flags: stored per store, overridable per deployment with FEATURE_FLAGS
 * ("key=on,other=off"). Targeted flags only switch on for the listed customer groups.
 */
export function envOverrides(): Map<string, boolean> {
  return new Map(
    serverEnv.FEATURE_FLAGS.split(",")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const [key, value] = pair.split("=")
        return [key.trim(), value?.trim() !== "off"] as const
      }),
  )
}

export function flags() {
  return {
    async isEnabled(key: string, customerGroup: string | null = null): Promise<boolean> {
      const override = envOverrides().get(key)
      const flag = (await platform().listFlags(currentStoreId())).find((item) => item.key === key)
      const enabled = override ?? flag?.enabled ?? false
      if (!enabled) return false
      if (flag?.customerGroups?.length) return customerGroup !== null && flag.customerGroups.includes(customerGroup)
      return true
    },
    async all() {
      const overrides = envOverrides()
      return (await platform().listFlags(currentStoreId())).map((flag) => ({ ...flag, enabled: overrides.get(flag.key) ?? flag.enabled }))
    },
  }
}
